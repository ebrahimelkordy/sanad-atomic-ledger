import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart,
  TrendingUp,
  ShieldAlert,
  Package,
  ArrowLeft,
  MessageCircle,
  CheckCircle2,
  Clock,
  DatabaseBackup,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [{ title: "نظرة عامة — سند" }, { name: "robots", content: "noindex" }],
  }),
  component: DashboardHome,
});

function DashboardHome() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader />
      <KPIs />
      <div className="grid gap-6 lg:grid-cols-3">
        <LiveOrdersFeed />
        <PendingSettlements />
      </div>
      <BackupStatus />
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-sm text-muted-foreground">صباح الخير، أبو أحمد 👋</div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">نظرة عامة</h1>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs">
        <span className="h-2 w-2 animate-pulse-dot rounded-full bg-success" />
        <span className="text-muted-foreground">البوت متصل ويرد على العملاء</span>
      </div>
    </div>
  );
}

function KPIs() {
  const kpis = [
    {
      label: "أوردرات النهاردة",
      value: "٤٧",
      delta: "+١٢%",
      icon: ShoppingCart,
      tone: "primary" as const,
    },
    {
      label: "إيرادات النهاردة",
      value: "٨,٤٢٥",
      unit: "ج",
      delta: "+٨%",
      icon: TrendingUp,
      tone: "success" as const,
    },
    {
      label: "تسويات بانتظار تأكيدك",
      value: "٣",
      urgent: true,
      icon: ShieldAlert,
      tone: "warning" as const,
      href: "/dashboard/settlements",
    },
    {
      label: "منتجات قاربت تخلص",
      value: "٥",
      icon: Package,
      tone: "muted" as const,
      href: "/dashboard/products",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((k, i) => {
        const inner = (
          <Card
            className={`group relative overflow-hidden p-6 transition hover:shadow-lift ${
              k.urgent ? "border-warning/40 bg-warning/5" : "bg-card"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="text-xs font-medium text-muted-foreground">{k.label}</div>
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  k.tone === "primary"
                    ? "bg-primary-soft text-primary"
                    : k.tone === "success"
                      ? "bg-success/15 text-success"
                      : k.tone === "warning"
                        ? "bg-warning/15 text-warning"
                        : "bg-muted text-muted-foreground"
                }`}
              >
                <k.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="tabular text-3xl font-bold">{k.value}</span>
              {k.unit && <span className="text-sm text-muted-foreground">{k.unit}</span>}
            </div>
            <div className="mt-2 flex items-center justify-between">
              {k.delta ? (
                <span className="flex items-center gap-1 text-xs text-success">
                  <TrendingUp className="h-3 w-3" />
                  {k.delta}
                </span>
              ) : k.urgent ? (
                <Badge className="bg-warning text-warning-foreground hover:bg-warning">
                  محتاج تأكيدك
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">هذا الأسبوع</span>
              )}
              {k.href && (
                <ArrowLeft className="h-4 w-4 text-muted-foreground transition group-hover:-translate-x-1 group-hover:text-foreground" />
              )}
            </div>
          </Card>
        );
        return k.href ? (
          <Link key={i} to={k.href}>
            {inner}
          </Link>
        ) : (
          <div key={i}>{inner}</div>
        );
      })}
    </div>
  );
}

function LiveOrdersFeed() {
  const orders = [
    {
      id: "#١٠٢٣",
      customer: "أحمد محمد",
      items: "سكر ٢ك، زيت عين ١ل",
      total: "١٦٥",
      time: "من ٢ دقيقة",
      status: "success",
    },
    {
      id: "#١٠٢٢",
      customer: "منى السيد",
      items: "خبز، جبنة بيضاء، زيتون",
      total: "٩٠",
      time: "من ٨ دقيقة",
      status: "success",
    },
    {
      id: "#١٠٢١",
      customer: "خالد إبراهيم",
      items: "أرز ٥ك، مكرونة ×٣",
      total: "٢٢٠",
      time: "من ١٥ دقيقة",
      status: "pending",
    },
    {
      id: "#١٠٢٠",
      customer: "سارة عبد الله",
      items: "لبن ×٤، زبادي ×٦",
      total: "١٤٨",
      time: "من ٢٣ دقيقة",
      status: "success",
    },
  ];
  return (
    <Card className="lg:col-span-2">
      <div className="flex items-center justify-between border-b border-border p-6">
        <div>
          <h2 className="text-lg font-semibold">أوردرات مباشرة</h2>
          <p className="text-xs text-muted-foreground">آخر الأوردرات اللي وصلت من الواتساب</p>
        </div>
        <Button variant="ghost" size="sm" asChild className="text-primary">
          <Link to="/dashboard/orders">
            الكل
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      <div className="divide-y divide-border">
        {orders.map((o, i) => (
          <div
            key={i}
            className="animate-slide-in-top flex items-center gap-4 p-4 transition hover:bg-secondary/40"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                o.status === "success"
                  ? "bg-success/15 text-success"
                  : "bg-warning/15 text-warning"
              }`}
            >
              {o.status === "success" ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Clock className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="tabular text-xs text-muted-foreground">{o.id}</span>
                <span className="font-medium">{o.customer}</span>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">{o.items}</div>
            </div>
            <div className="text-left">
              <div className="tabular text-sm font-semibold">{o.total} ج</div>
              <div className="text-[11px] text-muted-foreground">{o.time}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PendingSettlements() {
  const items = [
    {
      raw: "حساب أحمد اتسدد ٢٥٠٠",
      ai: "تحويل من ذمم أحمد → كاش",
      amount: "٢,٥٠٠",
      time: "من ٥ دقيقة",
    },
    {
      raw: "دفعت للمورد كريم ٤٠٠٠",
      ai: "مصروف: مورد كريم",
      amount: "٤,٠٠٠",
      time: "من ٢٠ دقيقة",
    },
  ];
  return (
    <Card className="flex flex-col">
      <div className="border-b border-border p-6">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-warning" />
          <h2 className="text-lg font-semibold">بانتظار تأكيدك</h2>
          <Badge className="bg-warning text-warning-foreground hover:bg-warning">
            {items.length}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          مفيش قيد بيتنفّذ من غير موافقتك.
        </p>
      </div>
      <div className="flex-1 space-y-3 p-4">
        {items.map((it, i) => (
          <div
            key={i}
            className="rounded-xl border border-warning/30 bg-warning/5 p-4"
          >
            <div className="flex items-start gap-2">
              <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="text-xs text-foreground/80">"{it.raw}"</div>
            </div>
            <div className="mt-2 rounded-lg bg-card/60 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">فَهم AI: </span>
              {it.ai}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="tabular text-lg font-bold">{it.amount} ج</span>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  رفض
                </Button>
                <Button size="sm" className="h-8 gap-1 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  تأكيد
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BackupStatus() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-5 py-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <DatabaseBackup className="h-4 w-4 text-success" />
        <span>
          آخر نسخة احتياطية: <strong className="text-foreground">من ٥٥ دقيقة</strong>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-primary" />
        <span>دفتر الحسابات مؤمّن — Append-Only</span>
      </div>
    </div>
  );
}
