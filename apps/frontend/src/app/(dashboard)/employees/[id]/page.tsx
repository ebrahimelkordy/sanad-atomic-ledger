"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, Calendar, Plus, Banknote, Clock, TrendingDown, TrendingUp, CheckCircle2 } from "lucide-react";
import Link from "next/link";

const statusLabelMap: Record<string, string> = {
  PRESENT: "حاضر",
  ABSENT: "غائب",
  LEAVE: "إجازة",
  HALF_DAY: "نصف يوم",
};

const txTypeLabelMap: Record<string, { label: string; color: string }> = {
  ADVANCE: { label: "سلفة", color: "text-orange-600" },
  DEDUCTION: { label: "خصم", color: "text-destructive" },
  BONUS: { label: "مكافأة", color: "text-emerald-600" },
  PAYROLL_PAYMENT: { label: "صرف راتب", color: "text-blue-600" },
};

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rateHistory, setRateHistory] = useState<any[]>([]);

  // Attendance dialog
  const [attOpen, setAttOpen] = useState(false);
  const [attForm, setAttForm] = useState({ date: new Date().toISOString().slice(0, 10), status: "ABSENT" as any, overtime_hours: "", notes: "" });
  const [attSubmitting, setAttSubmitting] = useState(false);

  // Transaction dialog
  const [txOpen, setTxOpen] = useState(false);
  const [txForm, setTxForm] = useState({ type: "ADVANCE" as any, amount: "", notes: "" });
  const [txSubmitting, setTxSubmitting] = useState(false);

  // Rate Update dialog (غير رجعي)
  const [rateOpen, setRateOpen] = useState(false);
  const [rateForm, setRateForm] = useState({
    new_rate: "",
    change_reason: "PROMOTION" as any,
    salary_type: "DAILY" as any,
    notes: "",
    effective_date: new Date().toISOString().slice(0, 10),
  });
  const [rateSubmitting, setRateSubmitting] = useState(false);

  const fetchEmployee = async () => {
    setLoading(true);
    try {
      const [empData, historyData] = await Promise.all([
        api.getEmployeeById(id),
        api.getEmployeeRateHistory(id).catch(() => []),
      ]);
      setEmployee(empData);
      setRateHistory(historyData || []);
      if (empData) {
        setRateForm((prev) => ({
          ...prev,
          new_rate: String(empData.base_rate || ""),
          salary_type: empData.salary_type || "DAILY",
        }));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEmployee(); }, [id]);

  const handleRecordAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttSubmitting(true);
    try {
      await api.recordAttendance(id, {
        date: attForm.date,
        status: attForm.status,
        overtime_hours: parseFloat(attForm.overtime_hours) || 0,
        notes: attForm.notes || undefined,
      });
      await fetchEmployee();
      setAttOpen(false);
    } finally {
      setAttSubmitting(false);
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxSubmitting(true);
    try {
      await api.addEmployeeTransaction(id, {
        type: txForm.type,
        amount: parseFloat(txForm.amount) || 0,
        notes: txForm.notes || undefined,
      });
      setTxForm({ type: "ADVANCE", amount: "", notes: "" });
      await fetchEmployee();
      setTxOpen(false);
    } finally {
      setTxSubmitting(false);
    }
  };

  const handleUpdateRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setRateSubmitting(true);
    try {
      await api.updateEmployeeRate(id, {
        new_rate: parseFloat(rateForm.new_rate) || 0,
        change_reason: rateForm.change_reason,
        salary_type: rateForm.salary_type,
        notes: rateForm.notes || undefined,
        effective_date: rateForm.effective_date || undefined,
      });
      await fetchEmployee();
      setRateOpen(false);
    } finally {
      setRateSubmitting(false);
    }
  };

  const handlePaySalary = async () => {
    if (!employee?.summary?.net_salary_due) return;
    if (!confirm(`هل تريد تأكيد صرف المستحق (EGP ${employee.summary.net_salary_due.toFixed(2)}) للموظف "${employee.name}"؟`)) return;
    await api.addEmployeeTransaction(id, {
      type: "PAYROLL_PAYMENT",
      amount: employee.summary.net_salary_due,
      notes: `صرف مستحقات ${new Date().toLocaleDateString("ar-EG")}`,
    });
    await fetchEmployee();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-60" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!employee) return <p className="text-muted-foreground">لم يتم العثور على الموظف.</p>;

  const s = employee.summary || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/employees">
          <Button variant="ghost" size="icon"><ArrowRight className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{employee.name}</h1>
          <p className="text-sm text-muted-foreground">
            {employee.job_title || "—"} •{" "}
            <span>{employee.salary_type === "DAILY" ? `يومية: EGP ${Number(employee.base_rate).toFixed(2)}` : `راتب شهري: EGP ${Number(employee.base_rate).toFixed(2)}`}</span>
            {employee.phone && <span> • {employee.phone}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* تعديل الأجر / اليومية غير رجعي */}
          <Dialog open={rateOpen} onOpenChange={setRateOpen}>
            <DialogTrigger asChild>
              <Button variant="default" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <TrendingUp className="h-4 w-4" />
                تعديل المرتب / اليومية
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>تعديل المرتب / اليومية (بدون أثر رجعي)</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleUpdateRate} className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>نوع الأجر</Label>
                    <Select value={rateForm.salary_type} onValueChange={(v) => setRateForm({ ...rateForm, salary_type: v as any })} disabled={rateSubmitting}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DAILY">يومية (باليوم)</SelectItem>
                        <SelectItem value="MONTHLY">شهري (راتب ثابت)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>المعدل / الراتب الجديد (ج.م)</Label>
                    <Input type="number" min="0" step="0.01" placeholder="0.00" value={rateForm.new_rate} onChange={(e) => setRateForm({ ...rateForm, new_rate: e.target.value })} required disabled={rateSubmitting} />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>سبب التعديل / الزيادة</Label>
                  <Select value={rateForm.change_reason} onValueChange={(v) => setRateForm({ ...rateForm, change_reason: v as any })} disabled={rateSubmitting}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PROMOTION">ترقية / ترفيع وظيفي</SelectItem>
                      <SelectItem value="ANNUAL_RAISE">علاوة سنوية</SelectItem>
                      <SelectItem value="MERIT_BONUS">مكافأة أداء وتميز</SelectItem>
                      <SelectItem value="CORRECTION">تصحيح خطأ إداري</SelectItem>
                      <SelectItem value="OTHER">أسباب أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>تاريخ بدء تطبيق الزيادة</Label>
                  <Input type="date" value={rateForm.effective_date} onChange={(e) => setRateForm({ ...rateForm, effective_date: e.target.value })} required disabled={rateSubmitting} />
                </div>

                <div className="grid gap-2">
                  <Label>ملاحظات إضافية</Label>
                  <Input placeholder="مثال: بناءً على قرار مجلس الإدارة..." value={rateForm.notes} onChange={(e) => setRateForm({ ...rateForm, notes: e.target.value })} disabled={rateSubmitting} />
                </div>

                <div className="p-3 bg-muted/40 border rounded-lg text-xs text-muted-foreground">
                  🔒 <b>ضمان الأثر غير الرجعي:</b> التعديل سيُطبق للأمام فقط من تاريخ الزيادة. المعاملات والرواتب السابقة تفضل محسوبة بالمعدل القديم دون أي تغيير.
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setRateOpen(false)} disabled={rateSubmitting}>إلغاء</Button>
                  <Button type="submit" disabled={rateSubmitting || !rateForm.new_rate}>{rateSubmitting ? "جارٍ الحفظ..." : "تأكيد الزيادة"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* تسجيل استثناء حضور */}
          <Dialog open={attOpen} onOpenChange={setAttOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><Calendar className="h-4 w-4" />تسجيل استثناء</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader><DialogTitle>تسجيل استثناء حضور</DialogTitle></DialogHeader>
              <form onSubmit={handleRecordAttendance} className="space-y-4 pt-2">
                <div className="grid gap-2">
                  <Label>التاريخ</Label>
                  <Input type="date" value={attForm.date} onChange={(e) => setAttForm({ ...attForm, date: e.target.value })} required disabled={attSubmitting} />
                </div>
                <div className="grid gap-2">
                  <Label>الحالة</Label>
                  <Select value={attForm.status} onValueChange={(v) => setAttForm({ ...attForm, status: v })} disabled={attSubmitting}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRESENT">حاضر</SelectItem>
                      <SelectItem value="ABSENT">غائب</SelectItem>
                      <SelectItem value="LEAVE">إجازة</SelectItem>
                      <SelectItem value="HALF_DAY">نصف يوم</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>ساعات أوفر تايم (إن وجد)</Label>
                  <Input type="number" min="0" step="0.5" placeholder="0" value={attForm.overtime_hours} onChange={(e) => setAttForm({ ...attForm, overtime_hours: e.target.value })} disabled={attSubmitting} />
                </div>
                <div className="grid gap-2">
                  <Label>ملاحظة</Label>
                  <Input placeholder="اختياري..." value={attForm.notes} onChange={(e) => setAttForm({ ...attForm, notes: e.target.value })} disabled={attSubmitting} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAttOpen(false)} disabled={attSubmitting}>إلغاء</Button>
                  <Button type="submit" disabled={attSubmitting}>{attSubmitting ? "جارٍ الحفظ..." : "حفظ"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* سلفة / خصم / مكافأة */}
          <Dialog open={txOpen} onOpenChange={setTxOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />سلفة / خصم / مكافأة</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader><DialogTitle>إضافة معاملة مالية</DialogTitle></DialogHeader>
              <form onSubmit={handleAddTransaction} className="space-y-4 pt-2">
                <div className="grid gap-2">
                  <Label>النوع</Label>
                  <Select value={txForm.type} onValueChange={(v) => setTxForm({ ...txForm, type: v })} disabled={txSubmitting}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADVANCE">سلفة</SelectItem>
                      <SelectItem value="DEDUCTION">خصم</SelectItem>
                      <SelectItem value="BONUS">مكافأة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>المبلغ (ج.م)</Label>
                  <Input type="number" min="0" step="0.01" placeholder="0.00" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} required disabled={txSubmitting} />
                </div>
                <div className="grid gap-2">
                  <Label>ملاحظة</Label>
                  <Input placeholder="اختياري..." value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} disabled={txSubmitting} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setTxOpen(false)} disabled={txSubmitting}>إلغاء</Button>
                  <Button type="submit" disabled={txSubmitting || !txForm.amount}>{txSubmitting ? "جارٍ الحفظ..." : "إضافة"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">أيام حضور</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{s.present_days ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{employee.auto_attendance ? "بالحضور التلقائي" : "يدوي"}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">أيام غياب</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{s.absent_days ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">ساعات أوفر تايم</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-500">{s.overtime_hours ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">+EGP {(s.overtime_pay || 0).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card border-primary/30 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">صافي المستحق</CardTitle>
            <Banknote className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">EGP {(s.net_salary_due || 0).toFixed(2)}</div>
            {s.net_salary_due > 0 && (
              <Button size="sm" className="mt-2 h-7 text-xs" onClick={handlePaySalary}>صرف الآن</Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* جدول الحضور والاستثناءات */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">سجل الحضور والغياب</CardTitle>
            <CardDescription>الاستثناءات المسجلة يدوياً للشهر الحالي</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {employee.attendances?.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {employee.auto_attendance ? "لا توجد استثناءات — الحضور تلقائي كل الشهر" : "لم يتم تسجيل أي حضور بعد"}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">أوفر تايم</TableHead>
                    <TableHead className="text-right">ملاحظة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(employee.attendances || []).slice(0, 15).map((att: any) => (
                    <TableRow key={att.id}>
                      <TableCell className="text-sm">{new Date(att.date).toLocaleDateString("ar-EG")}</TableCell>
                      <TableCell>
                        <Badge variant={att.status === "PRESENT" ? "secondary" : att.status === "ABSENT" ? "destructive" : "outline"} className="text-xs">
                          {statusLabelMap[att.status] || att.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{Number(att.overtime_hours || 0) > 0 ? `${att.overtime_hours}h` : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{att.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* جدول السلف والخصومات والمكافآت */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">المعاملات المالية</CardTitle>
            <CardDescription>سلف • خصومات • مكافآت • صرف رواتب</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {employee.transactions?.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">لا توجد معاملات مالية مسجلة</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">ملاحظة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(employee.transactions || []).map((tx: any) => {
                    const info = txTypeLabelMap[tx.type] || { label: tx.type, color: "" };
                    return (
                      <TableRow key={tx.id}>
                        <TableCell><span className={`font-medium text-sm ${info.color}`}>{info.label}</span></TableCell>
                        <TableCell className="tabular font-semibold">EGP {Number(tx.amount).toFixed(2)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{new Date(tx.created_at).toLocaleDateString("ar-EG")}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{tx.notes || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* سجل التغييرات التاريخية غير الرجعية للمرتب واليوميات */}
      <Card className="shadow-card border-emerald-500/20">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              سجل الترقية والزيادات التاريخية (غير رجعي)
            </CardTitle>
            <CardDescription>تتبع جميع التعديلات السابقة والزيادات والعلاوات مع أسبابها</CardDescription>
          </div>
          <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
            {rateHistory.length} تعديل مسجل
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {rateHistory.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              لم يتم تسجيل أي زيادات أو تعديلات على راتب/يومية هذا الموظف بعد.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">التاريخ الفعلي</TableHead>
                  <TableHead className="text-right">المعدل السابق</TableHead>
                  <TableHead className="text-right">المعدل الجديد</TableHead>
                  <TableHead className="text-right">الفرق / الزيادة</TableHead>
                  <TableHead className="text-right">السبب</TableHead>
                  <TableHead className="text-right">ملاحظات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rateHistory.map((item: any) => {
                  const diff = Number(item.new_rate) - Number(item.old_rate);
                  const reasonMap: Record<string, string> = {
                    PROMOTION: "ترقية وظيفية",
                    ANNUAL_RAISE: "علاوة سنوية",
                    MERIT_BONUS: "مكافأة تميز",
                    CORRECTION: "تصحيح إداري",
                    OTHER: "أخرى",
                  };
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm font-medium">
                        {new Date(item.effective_date || item.created_at).toLocaleDateString("ar-EG")}
                      </TableCell>
                      <TableCell className="tabular text-muted-foreground">EGP {Number(item.old_rate).toFixed(2)}</TableCell>
                      <TableCell className="tabular font-bold text-emerald-600">EGP {Number(item.new_rate).toFixed(2)}</TableCell>
                      <TableCell className="tabular">
                        <Badge variant={diff >= 0 ? "secondary" : "destructive"} className="text-xs">
                          {diff >= 0 ? `+EGP ${diff.toFixed(2)}` : `-EGP ${Math.abs(diff).toFixed(2)}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{reasonMap[item.change_reason] || item.change_reason}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.notes || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ملخص مالي */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">ملخص الرواتب الشهري</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">الأجر المكتسب</span><span className="font-semibold">EGP {(s.earned_salary || 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">أجر أوفر تايم</span><span className="font-semibold text-orange-600">+EGP {(s.overtime_pay || 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">مكافآت</span><span className="font-semibold text-emerald-600">+EGP {(s.total_bonuses || 0).toFixed(2)}</span></div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">سلف مخصومة</span><span className="font-semibold text-destructive">-EGP {(s.total_advances || 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">خصومات</span><span className="font-semibold text-destructive">-EGP {(s.total_deductions || 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">مبالغ صُرفت</span><span className="font-semibold text-blue-600">-EGP {(s.total_paid || 0).toFixed(2)}</span></div>
            </div>
            <div className="flex flex-col items-center justify-center border rounded-xl p-4 bg-primary/5 border-primary/20">
              <p className="text-xs text-muted-foreground mb-1">صافي المستحق الآن</p>
              <p className="text-3xl font-bold text-primary">EGP {(s.net_salary_due || 0).toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
