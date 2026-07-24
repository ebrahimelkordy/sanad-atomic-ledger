"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, AlertCircle } from "lucide-react";

export default function OrderDetailsPage() {
  const params = useParams();
  const id = params?.id as string;

  return <OrderDetailsContent orderId={id} />;
}

function OrderDetailsContent({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrder() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getOrderById(orderId);
        setOrder(data);
      } catch (err: any) {
        setError(err.message || "حدث خطأ أثناء جلب الطلب");
      } finally {
        setLoading(false);
      }
    }
    if (orderId) fetchOrder();
  }, [orderId]);

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-40 w-full" />
              </CardContent>
            </Card>
          </div>
          <div>
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Error / 404 state
  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
            <CardTitle className="text-lg mb-2">الطلب غير موجود</CardTitle>
            <CardDescription className="mb-4">{error}</CardDescription>
            <Button asChild variant="outline">
              <Link href="/orders">
                <ArrowLeft className="ml-2 h-4 w-4" />
                العودة للأوردرات
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link href="/orders">
            <ArrowLeft className="h-4 w-4" />
            العودة للأوردرات
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">طلب #{order?.id || orderId}</h1>
          <p className="text-sm text-muted-foreground">تفاصيل الفاتورة وسجل المراجعة</p>
        </div>
        <Badge
          className={`self-start text-sm px-3 py-1 ${order?.status === "CONFIRMED"
              ? "bg-success text-success-foreground"
              : order?.status === "PENDING"
                ? "bg-warning text-warning-foreground"
                : order?.status === "REJECTED_INSUFFICIENT_STOCK" || order?.status === "CANCELLED"
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-secondary text-secondary-foreground"
            }`}
        >
          {order?.status || "—"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg">تفاصيل الفاتورة</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">اسم المنتج</TableHead>
                    <TableHead className="text-right">الكمية</TableHead>
                    <TableHead className="text-right">السعر وقت الطلب</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order?.details && order.details.length > 0 ? (
                    order.details.map((detail: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">
                          {detail.product_name || detail.productId || "—"}
                        </TableCell>
                        <TableCell>{detail.quantity}</TableCell>
                        <TableCell className="tabular">
                          EGP {Number(detail.unit_price_at_order || detail.unitPrice || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="tabular font-semibold">
                          EGP {Number((detail.unit_price_at_order || detail.unitPrice || 0) * detail.quantity).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        لا توجد تفاصيل متاحة
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Grand Total */}
              <div className="flex justify-end mt-4 pt-4 border-t border-border">
                <div className="text-left">
                  <p className="text-sm text-muted-foreground">الإجمالي الكلي</p>
                  <p className="text-2xl font-bold text-success tabular">
                    EGP {order?.total || order?.totalAmount
                      ? Number(order?.total || order?.totalAmount || 0).toFixed(2)
                      : "0.00"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audit Trail */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg text-gold">سجل المراجعة (Audit Trail)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg bg-muted p-4 text-sm font-mono">
                <div className="mb-2">
                  <span className="text-muted-foreground text-xs">
                    Source WhatsApp Msg ID:
                  </span>
                  <div className="text-foreground">
                    {order?.source_whatsapp_message_id || "—"}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">
                    Raw Message Text:
                  </span>
                  <div className="mt-1 rounded bg-background/50 p-3 text-foreground whitespace-pre-wrap">
                    {order?.raw_message_text || "—"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Customer Metadata */}
        <div className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">معلومات العميل</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">رقم واتساب</p>
                <p className="font-semibold tabular">{order?.customer_identifier || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">حالة الدفع</p>
                <p className="font-semibold text-success">—</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">تاريخ الطلب</p>
                <p className="font-semibold tabular">
                  {order?.created_at
                    ? new Date(order.created_at).toLocaleDateString("ar-EG")
                    : "—"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

