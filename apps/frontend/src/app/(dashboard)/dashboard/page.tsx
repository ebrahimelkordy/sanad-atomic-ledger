"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, BookLock, ShieldCheck, ArrowUpRight } from "lucide-react";

export default function DashboardPage() {
  const [tenant, setTenant] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [meData, ordersData, summaryData] = await Promise.all([
          api.getMe().catch(() => null),
          api.getOrders({ limit: 5 }).catch(() => []),
          api.getSummary().catch(() => []),
        ]);
        setTenant(meData);
        setOrders(ordersData || []);
        setSummary(summaryData || []);
      } catch (err) {
        console.error("Error loading dashboard data", err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* الترحيب والمعلومات */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          مرحباً بك، {tenant?.business_name || "التينانت"} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          إليك نظرة عامة على أداء نشاطك والمستحقات الماليّة في منصة سند
        </p>
      </div>

      {/* بطاقات الإحصائيات السريعة */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              الأوردرات الأخيرّة
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <ShoppingCart className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length}</div>
            <p className="text-xs text-muted-foreground mt-1">طلبات جارية ومسجلة في النظام</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              الملخص المالي
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-gold/10 text-gold flex items-center justify-center">
              <BookLock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.length}</div>
            <p className="text-xs text-muted-foreground mt-1">سجلات حسابية نشطة</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              تسويات بانتظارك
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">٣ تسويات</div>
            <p className="text-xs text-muted-foreground mt-1">تتطلب المراجعة والتأكيد</p>
          </CardContent>
        </Card>
      </div>

      {/* قائمة أحدث الأوردرات */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">أحدث الأوردرات</CardTitle>
            <CardDescription>عرض أحدث الطلبات المسجلة في النظام</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/orders" className="flex items-center gap-1">
              <span>عرض الكل</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">لا توجد أوردرات حالياً</p>
          ) : (
            <div className="divide-y divide-border">
              {orders.slice(0, 5).map((order) => (
                <div key={order.id} className="flex items-center justify-between py-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-sm">أوردر #{order.id?.slice(0, 8)}</span>
                    <span className="text-xs text-muted-foreground">{order.customer_phone || "عميل واتساب"}</span>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/orders/${order.id}`}>التفاصيل</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
