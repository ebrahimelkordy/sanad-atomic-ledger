import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookLock, MessageCircle, RotateCcw, TrendingUp, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/dashboard/ledger")({
  head: () => ({
    meta: [{ title: "دفتر الحسابات — سند" }, { name: "robots", content: "noindex" }],
  }),
  component: LedgerPage,
});

const ENTRIES = [
  { n: "٠٠٤٨", date: "٢٠٢٦/٠٧/٢٠", desc: "أوردر #١٠٢٣ — أحمد محمد", debit: null, credit: "١٦٥", balance: "٨,٤٢٥", ai: false },
  { n: "٠٠٤٧", date: "٢٠٢٦/٠٧/٢٠", desc: "تسوية دين — أحمد محمد (كاش)", debit: "٢,٥٠٠", credit: null, balance: "٨,٢٦٠", ai: true },
  { n: "٠٠٤٦", date: "٢٠٢٦/٠٧/٢٠", desc: "أوردر #١٠٢٢ — منى السيد", debit: null, credit: "٩٠", balance: "٥,٧٦٠", ai: false },
  { n: "٠٠٤٥", date: "٢٠٢٦/٠٧/٢٠", desc: "مصروف: مورد كريم", debit: "٤,٠٠٠", credit: null, balance: "٥,٦٧٠", ai: true },
  { n: "٠٠٤٤", date: "٢٠٢٦/٠٧/١٩", desc: "أوردر #١٠٢٠ — سارة عبد الله", debit: null, credit: "١٤٨", balance: "٩,٦٧٠", ai: false },
  { n: "٠٠٤٣", date: "٢٠٢٦/٠٧/١٩", desc: "قيد عكسي — تصحيح #٠٠٤٠", debit: "٥٠", credit: null, balance: "٩,٥٢٢", ai: false, reversal: true },
];

function LedgerPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">دفتر الحسابات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            كل قرش يخش أو يخرج بقيد دائم. ما فيش تعديل ولا مسح.
          </p>
        </div>
        <Badge className="gap-1.5 bg-primary-soft py-1.5 text-primary hover:bg-primary-soft">
          <BookLock className="h-3.5 w-3.5" />
          Append-Only Ledger
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <BalanceCard label="الرصيد الحالي" value="٨,٤٢٥" tone="primary" />
        <BalanceCard label="إجمالي الإيرادات" value="١٢,٩٤٠" tone="success" icon={TrendingUp} />
        <BalanceCard label="إجمالي المصروفات" value="٤,٥١٥" tone="destructive" icon={TrendingDown} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-4 text-right">رقم القيد</th>
                <th className="p-4 text-right">التاريخ</th>
                <th className="p-4 text-right">الوصف</th>
                <th className="p-4 text-right tabular">مدين</th>
                <th className="p-4 text-right tabular">دائن</th>
                <th className="p-4 text-right tabular">الرصيد</th>
                <th className="p-4 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ENTRIES.map((e) => (
                <tr key={e.n} className={`transition hover:bg-secondary/30 ${e.reversal ? "bg-destructive/5" : ""}`}>
                  <td className="p-4 tabular text-xs text-muted-foreground">{e.n}</td>
                  <td className="p-4 tabular text-xs text-muted-foreground">{e.date}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span>{e.desc}</span>
                      {e.ai && (
                        <Badge className="bg-gold/15 text-[10px] text-gold-foreground hover:bg-gold/15">
                          AI
                        </Badge>
                      )}
                      {e.reversal && (
                        <Badge className="bg-destructive/15 text-[10px] text-destructive hover:bg-destructive/15">
                          قيد عكسي
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-4 tabular text-destructive">{e.debit ? `${e.debit} ج` : "—"}</td>
                  <td className="p-4 tabular text-success">{e.credit ? `${e.credit} ج` : "—"}</td>
                  <td className="p-4 tabular font-semibold">{e.balance} ج</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-primary">
                        <MessageCircle className="h-3.5 w-3.5" />
                        الرسالة
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                        <RotateCcw className="h-3.5 w-3.5" />
                        عكسي
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function BalanceCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: "primary" | "success" | "destructive";
  icon?: typeof TrendingUp;
}) {
  const toneCls =
    tone === "primary"
      ? "bg-primary-soft text-primary"
      : tone === "success"
        ? "bg-success/15 text-success"
        : "bg-destructive/15 text-destructive";
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneCls}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="mt-4 tabular text-3xl font-bold">
        {value} <span className="text-base font-normal text-muted-foreground">ج</span>
      </div>
    </Card>
  );
}
