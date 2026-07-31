"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, Phone, MapPin, MessageSquare, StickyNote, DollarSign, ShoppingBag } from "lucide-react";

export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCustomerById(id).then((data) => {
      setCustomer(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-60" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!customer) return <p className="text-muted-foreground">لم يتم العثور على العميل.</p>;

  const confirmedSales = (customer.sales || []).filter((s: any) => s.status === "CONFIRMED");
  const totalBought = confirmedSales.reduce((sum: number, s: any) => sum + Number(s.total_amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/customers">
          <Button variant="ghost" size="icon"><ArrowRight className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          <div className="flex flex-wrap gap-4 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{customer.phone}</span>
            {customer.whatsapp && (
              <span className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5 text-emerald-600" />واتساب: {customer.whatsapp}</span>
            )}
            {customer.location_address && (
              <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{customer.location_address}</span>
            )}
          </div>
          {customer.notes && (
            <p className="mt-1.5 text-xs text-muted-foreground flex items-start gap-1.5">
              <StickyNote className="h-3.5 w-3.5 mt-0.5 shrink-0" />{customer.notes}
            </p>
          )}
        </div>
      </div>

      {/* KPIs: الوضع المالي */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className={`shadow-card ${customer.outstanding_debt > 0 ? "border-destructive/40 bg-destructive/5" : ""}`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">عليه (مديونية)</CardTitle>
            <DollarSign className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">EGP {(customer.outstanding_debt || 0).toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">الرصيد المستحق سداده</p>
          </CardContent>
        </Card>
        <Card className={`shadow-card ${customer.credit_balance > 0 ? "border-emerald-500/40 bg-emerald-500/5" : ""}`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">ليه (رصيد دائن)</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">EGP {(customer.credit_balance || 0).toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">رصيد لصالح العميل</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">إجمالي مشتريات العميل</CardTitle>
            <ShoppingBag className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">EGP {totalBought.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">{confirmedSales.length} فاتورة</p>
          </CardContent>
        </Card>
      </div>

      {/* سجل الفواتير (أخد إيه) */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">سجل فواتير المشتريات</CardTitle>
          <CardDescription>كل ما اشتراه العميل بالتفصيل</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {confirmedSales.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">لا توجد فواتير مسجلة لهذا العميل</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">رقم الفاتورة</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">نوع البيع</TableHead>
                  <TableHead className="text-right">الإجمالي</TableHead>
                  <TableHead className="text-right">المدفوع</TableHead>
                  <TableHead className="text-right">المتبقي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {confirmedSales.map((sale: any) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-mono text-xs font-bold">{sale.invoice_number}</TableCell>
                    <TableCell className="text-sm">{new Date(sale.created_at).toLocaleDateString("ar-EG")}</TableCell>
                    <TableCell>
                      <Badge variant={sale.sale_type === "CASH" ? "secondary" : "outline"} className="text-xs">
                        {sale.sale_type === "CASH" ? "كاش" : "آجل"}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular font-semibold">EGP {Number(sale.total_amount).toFixed(2)}</TableCell>
                    <TableCell className="tabular text-emerald-600">EGP {Number(sale.paid_amount).toFixed(2)}</TableCell>
                    <TableCell className="tabular">
                      {Number(sale.remaining_amount) > 0 ? (
                        <span className="font-bold text-destructive">EGP {Number(sale.remaining_amount).toFixed(2)}</span>
                      ) : (
                        <Badge variant="secondary" className="text-xs text-emerald-600">مسدد</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* كشف الحساب في الـ Ledger */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">كشف الحساب (دفتر الإيرادات والمصروفات)</CardTitle>
          <CardDescription>سجل تفصيلي لجميع القيود المحاسبية الخاصة بالعميل</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!customer.ledger_entries || customer.ledger_entries.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">لا توجد قيود في الدفتر لهذا العميل</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">نوع القيد</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-right">ملاحظة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.ledger_entries.slice(0, 20).map((entry: any) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm">{new Date(entry.created_at).toLocaleDateString("ar-EG")}</TableCell>
                    <TableCell>
                      <Badge variant={entry.entry_type === "DEBIT" ? "destructive" : "secondary"} className="text-xs">
                        {entry.entry_type === "DEBIT" ? "مدين" : "دائن"}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular font-semibold">EGP {Number(entry.amount).toFixed(2)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{entry.raw_message_text || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
