"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Users2, Plus, RefreshCw, Phone, MapPin, ChevronRight, DollarSign, CreditCard } from "lucide-react";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", whatsapp: "", location_address: "", notes: "" });

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const data = await api.getCustomers();
      setCustomers(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCustomers(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      await api.createCustomer(form);
      setMsg({ type: "success", text: "تم إضافة العميل بنجاح!" });
      setForm({ name: "", phone: "", whatsapp: "", location_address: "", notes: "" });
      await fetchCustomers();
      setTimeout(() => { setOpen(false); setMsg(null); }, 1500);
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "حدث خطأ" });
    } finally {
      setSubmitting(false);
    }
  };

  const totalDebt = customers.reduce((sum, c) => sum + (c.outstanding_debt || 0), 0);
  const totalCredit = customers.reduce((sum, c) => sum + (c.credit_balance || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">إدارة العملاء</h1>
          <p className="text-sm text-muted-foreground mt-1">بروفايل كامل لكل عميل مع كشف حسابه وسجل مشترياته</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={fetchCustomers} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2"><Plus className="h-4 w-4" /><span>عميل جديد</span></Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>إضافة عميل جديد</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-2">
                <div className="grid gap-2">
                  <Label>اسم العميل</Label>
                  <Input placeholder="مثال: سوبرماركت الأمل" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required disabled={submitting} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>رقم الهاتف</Label>
                    <Input placeholder="01012345678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required disabled={submitting} />
                  </div>
                  <div className="grid gap-2">
                    <Label>رقم الواتساب</Label>
                    <Input placeholder="اختياري" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} disabled={submitting} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>العنوان / الموقع</Label>
                  <Input placeholder="مثال: الحي العاشر، مدينة نصر" value={form.location_address} onChange={(e) => setForm({ ...form, location_address: e.target.value })} disabled={submitting} />
                </div>
                <div className="grid gap-2">
                  <Label>ملاحظات</Label>
                  <Input placeholder="اختياري..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} disabled={submitting} />
                </div>
                {msg && (
                  <div className={`p-3 rounded-md text-sm ${msg.type === "success" ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>{msg.text}</div>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>إلغاء</Button>
                  <Button type="submit" disabled={submitting || !form.name || !form.phone}>{submitting ? "جارٍ الإضافة..." : "إضافة"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">إجمالي العملاء</CardTitle>
            <Users2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{customers.length}</div></CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">إجمالي الذمم (عليهم)</CardTitle>
            <DollarSign className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">EGP {totalDebt.toFixed(2)}</div></CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">إجمالي الأرصدة (ليهم)</CardTitle>
            <CreditCard className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-600">EGP {totalCredit.toFixed(2)}</div></CardContent>
        </Card>
      </div>

      {/* قائمة العملاء */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
          : customers.length === 0
          ? (
            <div className="col-span-3 py-16 text-center text-muted-foreground">
              <Users2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>لا يوجد عملاء مسجلون بعد</p>
            </div>
          )
          : customers.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`}>
              <Card className="shadow-card hover:shadow-md transition-shadow cursor-pointer border-border/60 hover:border-primary/40">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-base">{c.name}</p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <Phone className="h-3 w-3" />{c.phone}
                      </div>
                      {c.location_address && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <MapPin className="h-3 w-3" />{c.location_address}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                  </div>
                  <div className="flex items-center justify-between border-t pt-2">
                    {c.outstanding_debt > 0 ? (
                      <div>
                        <p className="text-xs text-muted-foreground">عليه</p>
                        <p className="font-bold text-destructive">EGP {c.outstanding_debt.toFixed(2)}</p>
                      </div>
                    ) : c.credit_balance > 0 ? (
                      <div>
                        <p className="text-xs text-muted-foreground">ليه</p>
                        <p className="font-bold text-emerald-600">EGP {c.credit_balance.toFixed(2)}</p>
                      </div>
                    ) : (
                      <Badge variant="secondary" className="text-xs">حساب متوازن</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
      </div>
    </div>
  );
}
