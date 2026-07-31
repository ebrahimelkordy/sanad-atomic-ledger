import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Package, Plus, Search, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/dashboard/products")({
  head: () => ({
    meta: [{ title: "المنتجات — سند" }, { name: "robots", content: "noindex" }],
  }),
  component: ProductsPage,
});

const PRODUCTS = [
  { sku: "SK-001", name: "سكر أبيض ١ كيلو", price: "٣٥", stock: 42, unit: "كيلو" },
  { sku: "SK-002", name: "زيت عين ١ لتر", price: "٩٥", stock: 18, unit: "لتر" },
  { sku: "SK-003", name: "أرز مصري ١ كيلو", price: "٤٠", stock: 6, unit: "كيلو", low: true },
  { sku: "SK-004", name: "مكرونة سباجيتي ٤٠٠ج", price: "١٥", stock: 120, unit: "علبة" },
  { sku: "SK-005", name: "جبنة بيضاء ٥٠٠ج", price: "٦٥", stock: 3, unit: "علبة", low: true },
  { sku: "SK-006", name: "لبن كامل الدسم ١ لتر", price: "٢٥", stock: 34, unit: "علبة" },
  { sku: "SK-007", name: "زبادي طبيعي", price: "٨", stock: 4, unit: "علبة", low: true },
  { sku: "SK-008", name: "خبز فينو", price: "١٠", stock: 55, unit: "رغيف" },
];

function ProductsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">المنتجات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            المخزون الحي بتاعك. البوت بيبيع على الأسعار دي.
          </p>
        </div>
        <Button className="h-10 gap-1.5 rounded-lg shadow-md">
          <Plus className="h-4 w-4" />
          منتج جديد
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Package} label="إجمالي المنتجات" value={PRODUCTS.length.toString()} />
        <StatCard
          icon={AlertTriangle}
          label="قاربت تخلص"
          value={PRODUCTS.filter((p) => p.low).length.toString()}
          urgent
        />
        <StatCard icon={Package} label="خارج المخزون" value="٠" />
      </div>

      <Card className="p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="ابحث عن منتج..." className="h-10 pr-9" />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-4 text-right">SKU</th>
                <th className="p-4 text-right">اسم المنتج</th>
                <th className="p-4 text-right tabular">السعر</th>
                <th className="p-4 text-right tabular">المخزون</th>
                <th className="p-4 text-right">الحالة</th>
                <th className="p-4 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {PRODUCTS.map((p) => (
                <tr key={p.sku} className="transition hover:bg-secondary/30">
                  <td className="p-4 tabular text-xs text-muted-foreground">{p.sku}</td>
                  <td className="p-4 font-medium">{p.name}</td>
                  <td className="p-4 tabular">{p.price} ج</td>
                  <td className="p-4 tabular">
                    {p.stock} <span className="text-xs text-muted-foreground">{p.unit}</span>
                  </td>
                  <td className="p-4">
                    {p.low ? (
                      <Badge className="gap-1 bg-warning/15 text-warning hover:bg-warning/15">
                        <AlertTriangle className="h-3 w-3" />
                        قارب يخلص
                      </Badge>
                    ) : (
                      <Badge className="bg-success/15 text-success hover:bg-success/15">
                        متوفر
                      </Badge>
                    )}
                  </td>
                  <td className="p-4">
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-primary">
                      تعديل
                    </Button>
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

function StatCard({
  icon: Icon,
  label,
  value,
  urgent,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  urgent?: boolean;
}) {
  return (
    <Card className={`p-6 ${urgent ? "border-warning/40 bg-warning/5" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            urgent ? "bg-warning/15 text-warning" : "bg-primary-soft text-primary"
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 tabular text-3xl font-bold">{value}</div>
    </Card>
  );
}
