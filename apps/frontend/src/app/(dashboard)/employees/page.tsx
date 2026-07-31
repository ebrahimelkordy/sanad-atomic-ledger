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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Plus, RefreshCw, TrendingUp, Clock, Banknote, ChevronRight } from "lucide-react";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    job_title: "",
    salary_type: "DAILY" as "DAILY" | "MONTHLY",
    base_rate: "",
    auto_attendance: true,
  });

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const data = await api.getEmployees();
      setEmployees(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEmployees(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      await api.createEmployee({
        name: form.name,
        phone: form.phone || undefined,
        job_title: form.job_title || undefined,
        salary_type: form.salary_type,
        base_rate: parseFloat(form.base_rate) || 0,
        auto_attendance: form.auto_attendance,
      });
      setMsg({ type: "success", text: "تم إضافة الموظف/العامل بنجاح!" });
      setForm({ name: "", phone: "", job_title: "", salary_type: "DAILY", base_rate: "", auto_attendance: true });
      await fetchEmployees();
      setTimeout(() => { setOpen(false); setMsg(null); }, 1500);
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "حدث خطأ" });
    } finally {
      setSubmitting(false);
    }
  };

  const totalPayroll = employees.reduce((sum, e) => sum + (e.summary?.net_salary_due || 0), 0);
  const dailyCount = employees.filter((e) => e.salary_type === "DAILY").length;
  const monthlyCount = employees.filter((e) => e.salary_type === "MONTHLY").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">إدارة الموظفين والعمال</h1>
          <p className="text-sm text-muted-foreground mt-1">رواتب شهرية، يومية، حضور تلقائي، وكشف مستحقات</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={fetchEmployees} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>إضافة موظف</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>إضافة موظف أو عامل جديد</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-2">
                <div className="grid gap-2">
                  <Label>الاسم</Label>
                  <Input placeholder="مثال: محمد أحمد" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required disabled={submitting} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>رقم الهاتف</Label>
                    <Input placeholder="01012345678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={submitting} />
                  </div>
                  <div className="grid gap-2">
                    <Label>المسمى الوظيفي</Label>
                    <Input placeholder="عامل / محاسب..." value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} disabled={submitting} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>نوع الأجر</Label>
                    <Select value={form.salary_type} onValueChange={(v) => setForm({ ...form, salary_type: v as any })} disabled={submitting}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DAILY">يومية (باليوم)</SelectItem>
                        <SelectItem value="MONTHLY">شهري (راتب ثابت)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>{form.salary_type === "DAILY" ? "اليومية (ج.م)" : "الراتب الشهري (ج.م)"}</Label>
                    <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.base_rate} onChange={(e) => setForm({ ...form, base_rate: e.target.value })} required disabled={submitting} />
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                  <input
                    type="checkbox"
                    id="auto-att"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={form.auto_attendance}
                    onChange={(e) => setForm({ ...form, auto_attendance: e.target.checked })}
                    disabled={submitting}
                  />
                  <div>
                    <label htmlFor="auto-att" className="font-medium text-sm cursor-pointer">تفعيل الحضور التلقائي</label>
                    <p className="text-xs text-muted-foreground">النظام يحسب حضوره تلقائياً كل يوم، وتسجل الاستثناءات فقط (غياب / إجازة / أوفر تايم)</p>
                  </div>
                </div>
                {msg && (
                  <div className={`p-3 rounded-md text-sm ${msg.type === "success" ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>{msg.text}</div>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>إلغاء</Button>
                  <Button type="submit" disabled={submitting || !form.name || !form.base_rate}>{submitting ? "جارٍ الإضافة..." : "إضافة"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي المستحقات هذا الشهر</CardTitle>
            <Banknote className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">EGP {totalPayroll.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">عمال باليومية</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dailyCount}</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">موظفين بالشهر</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{monthlyCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* قائمة الموظفين */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
          : employees.length === 0
          ? (
            <div className="col-span-3 py-16 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>لا يوجد موظفون أو عمال مسجلون بعد</p>
            </div>
          )
          : employees.map((emp) => {
            const s = emp.summary || {};
            return (
              <Link key={emp.id} href={`/employees/${emp.id}`}>
                <Card className="shadow-card hover:shadow-md transition-shadow cursor-pointer border-border/60 hover:border-primary/40">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-base">{emp.name}</p>
                        <p className="text-xs text-muted-foreground">{emp.job_title || "—"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={emp.salary_type === "DAILY" ? "outline" : "secondary"} className="text-xs">
                          {emp.salary_type === "DAILY" ? "يومية" : "شهري"}
                        </Badge>
                        {emp.auto_attendance && (
                          <Badge className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">حضور تلقائي</Badge>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">أيام حضور:</span>
                        <span className="font-bold mr-1">{s.present_days ?? "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">غياب:</span>
                        <span className="font-bold mr-1 text-destructive">{s.absent_days ?? 0}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t pt-2">
                      <div>
                        <p className="text-xs text-muted-foreground">صافي المستحق</p>
                        <p className="font-bold text-base text-primary">EGP {(s.net_salary_due || 0).toFixed(2)}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
      </div>
    </div>
  );
}
