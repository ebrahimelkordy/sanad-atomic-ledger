"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Search, Eye, AlertCircle, Filter } from "lucide-react";

const STATUS_FILTERS = [
  { value: "ALL", label: "الكل" },
  { value: "PENDING", label: "معلق" },
  { value: "CONFIRMED", label: "مؤكد" },
  { value: "REJECTED_INSUFFICIENT_STOCK", label: "مرفوض (مخزون)" },
  { value: "CANCELLED", label: "ملغي" },
];

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
  PENDING: { variant: "outline", className: "border-warning text-warning bg-warning/10" },
  CONFIRMED: { variant: "outline", className: "border-success text-success bg-success/10" },
  REJECTED_INSUFFICIENT_STOCK: { variant: "destructive", className: "" },
  CANCELLED: { variant: "secondary", className: "" },
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getOrders({
        status: statusFilter !== "ALL" ? statusFilter : undefined,
        search: search || undefined,
      });
      setOrders(data);
    } catch (err: any) {
      setError(err.message || "فشل تحميل الأوردرات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrders();
  };

  // Re-fetch when filters change
  useEffect(() => {
    if (!loading) fetchOrders();
  }, [statusFilter]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">الأوردرات — الطلبات</h1>

      {/* Filters */}
      <Card className="shadow-card">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="flex-1 w-full sm:w-auto">
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-9"
                />
              </form>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchOrders} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">
            {loading ? "جارٍ التحميل..." : `${orders.length} طلب`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">لا توجد أوردرات</p>
              <p className="text-sm text-muted-foreground mt-1">
                {statusFilter !== "ALL" ? "حاول تغيير فلتر الحالة" : "لم يتم استلام أي طلب بعد"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">#</TableHead>
                  <TableHead className="text-right">العميل</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">الإجمالي</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order: any, idx: number) => {
                  const statusInfo = STATUS_BADGE[order.order_status as string] || {
                    variant: "default" as const,
                    className: "",
                  };
                  return (
                    <TableRow key={order.id || idx}>
                      <TableCell className="font-mono tabular text-xs">{order.id?.slice(0, 8) || idx + 1}</TableCell>
                      <TableCell className="font-medium">{order.customer_whatsapp || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant} className={statusInfo.className}>
                          {order.order_status || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular font-semibold">
                        EGP {order.grand_total
                          ? Number(order.grand_total).toFixed(2)
                          : "0.00"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular">
                        {order.created_at
                          ? new Date(order.created_at).toLocaleDateString("ar-EG")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="icon">
                          <Link href={`/orders/${order.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

