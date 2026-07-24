"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { RefreshCw, Plus, QrCode, AlertCircle } from "lucide-react";

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string; className: string }> = {
  CONNECTED: { variant: "outline", label: "متصل", className: "border-success text-success bg-success/10" },
  PENDING_QR_SCAN: { variant: "outline", label: "بانتظار مسح QR", className: "border-warning text-warning bg-warning/10" },
  DISCONNECTED: { variant: "destructive", label: "غير متصل", className: "" },
};

const ROLE_OPTIONS = [
  { value: "PUBLIC_SALES", label: "مبيعات عامة" },
  { value: "AUTHORIZED_FINANCE", label: "مصرح مالي" },
];

export default function TenantsPage() {
  const [tenant, setTenant] = useState<any>(null);
  const [numbers, setNumbers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [numbersLoading, setNumbersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add number form state
  const [newNumber, setNewNumber] = useState("");
  const [newRole, setNewRole] = useState("PUBLIC_SALES");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const fetchTenant = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getMe();
      setTenant(data);
    } catch (err: any) {
      setError(err.message || "فشل تحميل بيانات التينانت");
    } finally {
      setLoading(false);
    }
  };

  const fetchNumbers = async () => {
    setNumbersLoading(true);
    try {
      const data = await api.getWhatsappNumbers();
      setNumbers(data);
    } catch (err: any) {
      console.error("Failed to fetch numbers:", err);
    } finally {
      setNumbersLoading(false);
    }
  };

  useEffect(() => {
    fetchTenant();
    fetchNumbers();
  }, []);

  const handleAddNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    setAdding(true);
    try {
      await api.addWhatsappNumber(newNumber, newRole);
      setNewNumber("");
      setNewRole("PUBLIC_SALES");
      await fetchNumbers();
    } catch (err: any) {
      setAddError(err.message || "فشل إضافة الرقم");
    } finally {
      setAdding(false);
    }
  };

  // ——— Loading State ———
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </CardContent>
          </Card>
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // ——— Error State ———
  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
            <CardTitle className="text-lg mb-2">خطأ في تحميل البيانات</CardTitle>
            <CardDescription className="mb-4">{error}</CardDescription>
            <Button onClick={fetchTenant}>
              <RefreshCw className="ml-2 h-4 w-4" />
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">التينانت — إدارة الحساب</h1>

      {/* Tenant Info + Add Number */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Tenant Info Card */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">بيانات التينانت</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">اسم الأعمال</span>
              <span className="text-sm font-semibold">{tenant?.business_name || tenant?.businessName || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">نوع النشاط</span>
              <span className="text-sm font-semibold">{tenant?.vertical_type || tenant?.verticalType || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">تاريخ التسجيل</span>
              <span className="text-sm font-semibold tabular">
                {tenant?.created_at ? new Date(tenant.created_at).toLocaleDateString("ar-EG") : tenant?.createdAt ? new Date(tenant.createdAt).toLocaleDateString("ar-EG") : "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Add Number Form Card */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">إضافة رقم واتساب</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddNumber} className="space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="newNumber">رقم واتساب (بكود الدولة)</Label>
                <Input
                  id="newNumber"
                  type="text"
                  placeholder="مثال: 201001234567"
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                  required
                  disabled={adding}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="newRole">الدور</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger id="newRole" disabled={adding}>
                    <SelectValue placeholder="اختر الدور" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {addError && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {addError}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={adding}>
                {adding ? (
                  <>⏳ جارٍ الإضافة...</>
                ) : (
                  <>
                    <Plus className="ml-2 h-4 w-4" />
                    إضافة الرقم
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* WhatsApp Numbers Table */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">أرقام الواتساب المسجلة</CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchNumbers} disabled={numbersLoading}>
            <RefreshCw className={`h-4 w-4 ${numbersLoading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {numbersLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : numbers.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">لا توجد أرقام واتساب مسجلة بعد</p>
              <p className="text-sm text-muted-foreground mt-1">استخدم الفورم أعلاه لإضافة رقم جديد</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الرقم</TableHead>
                  <TableHead className="text-right">الدور</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">QR Code</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {numbers.map((num: any, idx: number) => {
                  const status = STATUS_BADGE[num.connection_status as string] || {
                    variant: "secondary" as const,
                    label: num.connection_status || "—",
                  };
                  return (
                    <TableRow key={num.id || idx}>
                      <TableCell className="font-mono tabular">{num.phone_number || num.whatsapp_number || "—"}</TableCell>
                      <TableCell>{num.number_role || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {num.connection_status === "PENDING_QR_SCAN" ? (
                          <Button variant="outline" size="sm" disabled>
                            <QrCode className="ml-2 h-4 w-4" />
                            QR — قريباً
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
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

