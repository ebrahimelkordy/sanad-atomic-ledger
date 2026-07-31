"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  User,
  Paperclip,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";

interface Attachment {
  mimeType: string;
  base64Data: string;
  originalName: string;
  previewUrl?: string;
}

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  attachments?: Attachment[];
  pendingAction?: {
    type: string;
    data: Record<string, unknown>;
  };
  confirmedState?: "confirmed" | "rejected";
  timestamp: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "bot",
      text: "أهلاً بك في مساعد سند الذكي! 👋\nيمكنك كتابة طلبات شراء، تسجيل مديونيات/سداد، أو ارفاق صور وفواتير وسأقوم بتنظيمها وتفريغها تلقائياً.",
      timestamp: new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const history = await api.getChatHistory();
        if (history && history.length > 0) {
          setMessages(history);
        }
      } catch (err) {
        console.error("Failed to load chat history:", err);
      }
    };
    fetchHistory();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(",")[1];
        setAttachments((prev) => [
          ...prev,
          {
            mimeType: file.type || "application/octet-stream",
            base64Data,
            originalName: file.name,
            previewUrl: file.type.startsWith("image/") ? result : undefined,
          },
        ]);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: input.trim(),
      attachments: [...attachments],
      timestamp: new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachments([]);
    setLoading(true);

    try {
      const res = await api.sendChatMessage(
        userMsg.text,
        userMsg.attachments?.map((a) => ({
          mimeType: a.mimeType,
          base64Data: a.base64Data,
          originalName: a.originalName,
        }))
      );

      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: res.reply,
        pendingAction: res.requiresConfirmation ? res.pendingAction : undefined,
        timestamp: new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          sender: "bot",
          text: `عذراً، حدث خطأ أثناء الاتصال بالخادم: ${err.message || "خطأ غير معروف"}`,
          timestamp: new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (msgId: string, actionType: string, actionData: Record<string, unknown>) => {
    setConfirmingId(msgId);
    try {
      const res = await api.confirmChatAction(actionType, actionData, msgId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, confirmedState: res.success ? "confirmed" : "rejected", text: `${m.text}\n\n${res.reply}` }
            : m
        )
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, confirmedState: "rejected", text: `${m.text}\n\n❌ فشل التأكيد: ${err.message}` }
            : m
        )
      );
    } finally {
      setConfirmingId(null);
    }
  };

  const handleReject = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, confirmedState: "rejected", text: `${m.text}\n\nتم إلغاء الأمر بناءً على طلبك.` }
          : m
      )
    );
  };

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            المساعد الذكي (AI Chat)
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            تحدث مع الذكاء الاصطناعي لتفريغ الفواتير، الأوردرات والمعاملات المحاسبية مباشرة
          </p>
        </div>
      </div>

      {/* Main Chat Box */}
      <Card className="flex-1 flex flex-col overflow-hidden shadow-card border-border/80">
        {/* Messages Scroll Area */}
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-[85%] sm:max-w-[75%] ${
                msg.sender === "user" ? "mr-auto flex-row-reverse" : "ml-auto"
              }`}
            >
              {/* Avatar */}
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-white shrink-0 mt-1 ${
                  msg.sender === "user" ? "bg-primary" : "bg-emerald-600"
                }`}
              >
                {msg.sender === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>

              {/* Message Content */}
              <div className="space-y-2">
                <div
                  className={`p-3.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed shadow-sm ${
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-none"
                      : "bg-muted border border-border/60 rounded-tl-none text-foreground"
                  }`}
                >
                  {msg.text}

                  {/* Attachments inside user message */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-primary-foreground/20 space-y-1.5">
                      {msg.attachments.map((att, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs bg-black/10 p-1.5 rounded-lg">
                          {att.previewUrl ? (
                            <img src={att.previewUrl} alt="preview" className="h-10 w-10 object-cover rounded" />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0" />
                          )}
                          <span className="truncate max-w-[150px]">{att.originalName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Confirmation Box if pending */}
                {msg.pendingAction && !msg.confirmedState && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2.5">
                    <p className="text-xs font-semibold text-amber-600 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      يتطلب تأكيدك لتنفيذ العملية في النظام:
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={confirmingId === msg.id}
                        onClick={() => handleConfirm(msg.id, msg.pendingAction!.type, msg.pendingAction!.data)}
                      >
                        {confirmingId === msg.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        تأكيد وتنفيذ
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1 text-destructive hover:text-destructive"
                        disabled={confirmingId === msg.id}
                        onClick={() => handleReject(msg.id)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        إلغاء
                      </Button>
                    </div>
                  </div>
                )}

                {msg.confirmedState && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      msg.confirmedState === "confirmed"
                        ? "border-emerald-500 text-emerald-600 bg-emerald-500/5"
                        : "border-destructive text-destructive bg-destructive/5"
                    }`}
                  >
                    {msg.confirmedState === "confirmed" ? "تم التأكيد والتنفيذ" : "ملغى"}
                  </Badge>
                )}

                <span className="text-[10px] text-muted-foreground block px-1">{msg.timestamp}</span>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 max-w-[75%] ml-auto items-center">
              <div className="h-8 w-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4" />
              </div>
              <div className="p-3 bg-muted rounded-2xl rounded-tl-none border border-border/60 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                جارٍ تحليل البيانات وصياغة الرد...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </CardContent>

        {/* Selected Attachments Preview bar */}
        {attachments.length > 0 && (
          <div className="px-4 py-2 bg-muted/40 border-t border-border flex items-center gap-2 overflow-x-auto">
            {attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-background border px-2.5 py-1 rounded-lg text-xs">
                {att.previewUrl ? (
                  <ImageIcon className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-primary" />
                )}
                <span className="truncate max-w-[120px]">{att.originalName}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive mr-1"
                  onClick={() => removeAttachment(i)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <div className="p-3 bg-background border-t border-border">
          <form onSubmit={handleSend} className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept="image/*,application/pdf"
              onChange={handleFileSelect}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              title="إرفاق صورة أو فاتورة"
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <Input
              placeholder="اكتب طلب شراء، مديونية، أو ارفع صورة فاتورة..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-muted/30 focus-visible:bg-background"
              disabled={loading}
            />
            <Button type="submit" size="icon" className="shrink-0" disabled={loading || (!input.trim() && attachments.length === 0)}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
