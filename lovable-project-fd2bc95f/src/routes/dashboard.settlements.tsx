import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, MessageCircle, ShieldAlert, Clock, Sparkles } from "lucide-react";

export const Route = createFileRoute("/dashboard/settlements")({
  head: () => ({
    meta: [{ title: "التسويات — سند" }, { name: "robots", content: "noindex" }],
  }),
  component: SettlementsPage,
});

const PENDING = [
  {
    id: "PS-0012",
    raw: "حساب أحمد اتسدد ٢٥٠٠",
    ai: "تحويل من ذمم العميل أحمد → صندوق الكاش",
    from: "ذمم أحمد محمد",
    to: "كاش",
    amount: "٢,٥٠٠",
    time: "منذ ٥ دقايق",
    source: "٠١٠٠٠٠٠٩٩٨٧ (المدير)",
  },
  {
    id: "PS-0011",
    raw: "دفعت للمورد كريم ٤٠٠٠",
    ai: "مصروف: مورد كريم من الكاش",
    from: "كاش",
    to: "مصروف — موردين",
    amount: "٤,٠٠٠",
    time: "منذ ٢٠ دقيقة",
    source: "٠١٠٠٠٠٠٩٩٨٧ (المدير)",
  },
  {
    id: "PS-0010",
    raw: "منى دفعت ٦٠٠ على حسابها",
    ai: "تحصيل من ذمم منى السيد → كاش",
    from: "ذمم منى السيد",
    to: "كاش",
    amount: "٦٠٠",
    time: "منذ ٤٥ دقيقة",
    source: "٠١٠٠٠٠٠٩٩٨٧ (المدير)",
  },
];

function SettlementsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-warning" />
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">تسويات بانتظار تأكيدك</h1>
          <Badge className="bg-warning text-warning-foreground hover:bg-warning">{PENDING.length}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          مفيش قيد مالي بيتنفّذ في دفترك من غير موافقة صريحة منك. راجع كل تسوية اقترحها AI،
          وبعدين أكّد أو ارفض.
        </p>
      </div>

      <div className="space-y-4">
        {PENDING.map((p) => (
          <Card key={p.id} className="overflow-hidden border-warning/30 bg-warning/5">
            <div className="border-b border-warning/20 bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {p.source} · <span className="tabular">{p.id}</span>
                    </div>
                    <div className="mt-1 text-base italic text-foreground">"{p.raw}"</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {p.time}
                </div>
              </div>
            </div>

            <div className="p-5">
              <div className="mb-4 flex items-center gap-2 text-xs">
                <Sparkles className="h-3.5 w-3.5 text-gold" />
                <span className="font-semibold">فَهم الـ AI:</span>
                <span className="text-muted-foreground">{p.ai}</span>
              </div>

              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <MiniBox label="من حساب" value={p.from} />
                <MiniBox label="إلى حساب" value={p.to} />
                <MiniBox label="القيمة" value={`${p.amount} ج`} highlight />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  التأكيد بيسجّل قيد دائم في دفتر الحسابات.
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="h-10 gap-1.5 rounded-lg">
                    <XCircle className="h-4 w-4" />
                    رفض
                  </Button>
                  <Button className="h-10 gap-1.5 rounded-lg bg-success text-success-foreground shadow-md hover:bg-success/90">
                    <CheckCircle2 className="h-4 w-4" />
                    تأكيد وتسجيل
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MiniBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? "border-primary/40 bg-primary-soft" : "border-border bg-card"
      }`}
    >
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-semibold ${highlight ? "tabular text-xl text-primary" : "text-sm"}`}
      >
        {value}
      </div>
    </div>
  );
}
