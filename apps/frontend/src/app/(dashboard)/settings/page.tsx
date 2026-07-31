"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Phone, Building, Plus, CheckCircle2, Smartphone, Copy } from "lucide-react";

export default function SettingsPage() {
  const [tenant, setTenant] = useState<any>(null);
  const [whatsappNumbers, setWhatsappNumbers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // نموذج إضافة رقم واتساب جديد
  const [newNumber, setNewNumber] = useState("");
  const [role, setRole] = useState("PUBLIC_SALES");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // حالة كود الاقتران
  const [pairNumber, setPairNumber] = useState("");
  const [pairResult, setPairResult] = useState<{ code: string; msg: string } | null>(null);
  const [pairing, setPairing] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [meData, numbersData] = await Promise.all([
          api.getMe().catch(() => null),
          api.getWhatsappNumbers().catch(() => []),
        ]);
        setTenant(meData);
        setWhatsappNumbers(numbersData || []);
      } catch (err) {
        console.error("Error loading settings data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleAddNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNumber) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await api.addWhatsappNumber(newNumber, role);
      setMessage({ type: "success", text: "تم ربط رقم الواتساب بنجاح!" });
      setNewNumber("");
      // تحديث القائمة
      const updated = await api.getWhatsappNumbers();
      setWhatsappNumbers(updated || []);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "حدث خطأ أثناء ربط الرقم" });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePairCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairNumber) return;
    setPairing(true);
    setPairResult(null);
    try {
      const data = await api.requestPairCode(pairNumber);
      setPairResult({ code: data.pairing_code, msg: data.message });
    } catch (err: any) {
      setPairResult({ code: "", msg: err.message || "حدث خطأ أثناء طلب كود الاقتران" });
    } finally {
      setPairing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">إعدادات الحساب والتينانت</h1>
        <p className="text-sm text-muted-foreground">
          إدارة بيانات النشاط التجاري وأرقام الواتساب المربوطة بالنظام
        </p>
      </div>

      {/* بيانات التينانت */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building className="h-5 w-5 text-primary" />
            <span>معلومات النشاط التجاري</span>
          </CardTitle>
          <CardDescription>البيانات الأساسية المسجلة للتينانت</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4 border-b pb-4">
            <div>
              <span className="text-xs text-muted-foreground block">اسم الأعمال:</span>
              <span className="font-semibold text-base">{tenant?.business_name || "غير محدد"}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">نوع النشاط (Vertical):</span>
              <Badge variant="secondary" className="mt-1">
                {tenant?.vertical_type || "RESTAURANT"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* أرقام الواتساب المربوطة */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="h-5 w-5 text-gold" />
            <span>أرقام الواتساب المربوطة</span>
          </CardTitle>
          <CardDescription>
            الأرقام المستخدمة لاستقبال أوامر المبيعات أو تسويات المالية
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* قائمة الأرقام الحالية */}
          <div className="space-y-3">
            {whatsappNumbers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                لا توجد أرقام واتساب مسجلة حالياً
              </p>
            ) : (
              whatsappNumbers.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    <div>
                      <p className="font-semibold text-sm">{item.whatsapp_number}</p>
                      <p className="text-xs text-muted-foreground">
                        الدور: {item.number_role === "PUBLIC_SALES" ? "مبيعات عامة" : "مالية وتسويات"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">{item.number_role}</Badge>
                </div>
              ))
            )}
          </div>

          {/* إضافة رقم جديد */}
          <form onSubmit={handleAddNumber} className="border-t pt-6 space-y-4">
            <h4 className="font-semibold text-sm flex items-center gap-1">
              <Plus className="h-4 w-4" />
              ربط رقم واتساب جديد
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="num">رقم الواتساب (بكود الدولة)</Label>
                <Input
                  id="num"
                  placeholder="مثال: 201001234567"
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">وظيفة الرقم</Label>
                <Select value={role} onValueChange={setRole} disabled={submitting}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PUBLIC_SALES">مبيعات عامة (PUBLIC_SALES)</SelectItem>
                    <SelectItem value="FINANCE">مالية وتسويات (FINANCE)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {message && (
              <div
                className={`p-3 rounded-md text-sm ${
                  message.type === "success"
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {message.text}
              </div>
            )}

            <Button type="submit" disabled={submitting || !newNumber}>
              {submitting ? "جارٍ الربط..." : "ربط الرقم الآن"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* كارت كود الاقتران بالواتساب */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-emerald-500" />
            <span>ربط الواتساب بكود الاقتران (Pairing Code)</span>
          </CardTitle>
          <CardDescription>
            اكتب رقم الواتساب واضغط "احصل على الكود" ثم أدخله في تطبيق الواتساب من الأجهزة المرتبطة
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePairCode} className="space-y-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1 grid gap-2">
                <Label htmlFor="pair-num">رقم الواتساب</Label>
                <Input
                  id="pair-num"
                  placeholder="مثال: 201001234567"
                  value={pairNumber}
                  onChange={(e) => setPairNumber(e.target.value)}
                  required
                  disabled={pairing}
                />
              </div>
              <Button type="submit" disabled={pairing || !pairNumber} className="shrink-0">
                {pairing ? "جارٍ الطلب..." : "احصل على الكود"}
              </Button>
            </div>

            {pairResult && (
              <div className={`rounded-lg border p-4 ${pairResult.code ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5"}`}>
                {pairResult.code ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">{pairResult.msg}</p>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-2xl font-bold tracking-widest text-emerald-600">
                        {pairResult.code}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => navigator.clipboard.writeText(pairResult.code)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-destructive">{pairResult.msg}</p>
                )}
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
