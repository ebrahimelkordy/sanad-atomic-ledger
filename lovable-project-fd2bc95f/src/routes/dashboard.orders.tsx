import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Search, CheckCircle2, Clock, XCircle } from "lucide-react";

export const Route = createFileRoute("/dashboard/orders")({
  head: () => ({
    meta: [{ title: "الأوردرات — سند" }, { name: "robots", content: "noindex" }],
  }),
  component: OrdersPage,
});

const ORDERS = [
  { id: "#١٠٢٣", customer: "أحمد محمد", phone: "٠١٠٠٠٠٠١٢٣٤", total: "١٦٥", status: "success", time: "منذ دقيقتين", items: 3 },
  { id: "#١٠٢٢", customer: "منى السيد", phone: "٠١٠٠٠٠٠٥٦٧٨", total: "٩٠", status: "success", time: "منذ ٨ دقايق", items: 3 },
  { id: "#١٠٢١", customer: "خالد إبراهيم", phone: "٠١٠٠٠٠٠٩٩٨٧", total: "٢٢٠", status: "pending", time: "منذ ١٥ دقيقة", items: 2 },
  { id: "#١٠٢٠", customer: "سارة عبد الله", phone: "٠١٠٠٠٠٠٤٤٥٥", total: "١٤٨", status: "success", time: "منذ ٢٣ دقيقة", items: 4 },
  { id: "#١٠١٩", customer: "محمود عادل", phone: "٠١٠٠٠٠٠٢٢٣٣", total: "٤٥", status: "failed", time: "منذ ٤٠ دقيقة", items: 1 },
  { id: "#١٠١٨", customer: "نور حسن", phone: "٠١٠٠٠٠٠٧٧٨٨", total: "٣٢٠", status: "success", time: "منذ ساعة", items: 6 },
];

const statusMap = {
  success: { label: "منفّذ", icon: CheckCircle2, cls: "bg-success/15 text-success" },
  pending: { label: "قيد التنفيذ", icon: Clock, cls: "bg-warning/15 text-warning" },
  failed: { label: "فشل", icon: XCircle, cls: "bg-destructive/15 text-destructive" },
};

function OrdersPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">الأوردرات</h1>
        <p className="mt-1 text-sm text-muted-foreground">كل الأوردرات اللي وصلت من الواتساب.</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="ابحث برقم الأوردر أو اسم العميل..." className="h-10 pr-9" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["الكل", "منفّذ", "قيد التنفيذ", "فشل"].map((f, i) => (
              <Button
                key={f}
                variant={i === 0 ? "default" : "outline"}
                size="sm"
                className="h-9 rounded-lg text-xs"
              >
                {f}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-4 text-right">الأوردر</th>
                <th className="p-4 text-right">العميل</th>
                <th className="p-4 text-right">أصناف</th>
                <th className="p-4 text-right">الإجمالي</th>
                <th className="p-4 text-right">الحالة</th>
                <th className="p-4 text-right">الوقت</th>
                <th className="p-4 text-right">الرسالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ORDERS.map((o) => {
                const s = statusMap[o.status as keyof typeof statusMap];
                return (
                  <tr key={o.id} className="transition hover:bg-secondary/30">
                    <td className="p-4 tabular font-semibold">{o.id}</td>
                    <td className="p-4">
                      <div className="font-medium">{o.customer}</div>
                      <div className="tabular text-xs text-muted-foreground">{o.phone}</div>
                    </td>
                    <td className="p-4 tabular text-muted-foreground">{o.items}</td>
                    <td className="p-4 tabular font-semibold">{o.total} ج</td>
                    <td className="p-4">
                      <Badge className={`gap-1 ${s.cls} hover:${s.cls}`}>
                        <s.icon className="h-3 w-3" />
                        {s.label}
                      </Badge>
                    </td>
                    <td className="p-4 text-xs text-muted-foreground">{o.time}</td>
                    <td className="p-4">
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-primary">
                        <MessageCircle className="h-3.5 w-3.5" />
                        الأصلية
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
