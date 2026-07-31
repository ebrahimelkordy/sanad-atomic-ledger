"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const VERTICAL_OPTIONS = [
  { value: "RESTAURANT", label: "🍽️ مطعم" },
  { value: "PHARMACY", label: "💊 صيدلية" },
  { value: "RETAIL", label: "🏪 محل تجزئة" },
];

export default function RegisterPage() {
  const [form, setForm] = useState({
    businessName: "",
    verticalType: "RESTAURANT",
    whatsappNumber: "",
    numberRole: "PUBLIC_SALES",
    password: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.register(form.businessName, form.verticalType, form.whatsappNumber, form.numberRole, form.password);
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err: any) {
      setError(err.message || "فشل التسجيل");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm shadow-card">
          <CardContent className="pt-6 text-center">
            <div className="text-4xl mb-4">✅</div>
            <h3 className="text-lg font-semibold text-foreground mb-1">تم التسجيل بنجاح!</h3>
            <p className="text-sm text-muted-foreground">جارٍ التحويل لصفحة الدخول...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="text-lg font-bold">س</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">سند — Cipher</h1>
          </div>
          <p className="text-sm text-muted-foreground">تسجيل تينانت جديد</p>
        </div>
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">إنشاء حساب جديد</CardTitle>
            <CardDescription>أدخل بيانات الأعمال للتسجيل</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="reg-businessName">اسم الأعمال</Label>
                  <Input id="reg-businessName" name="businessName" type="text" placeholder="مثال: مطعم الأصيل" value={form.businessName} onChange={handleTextChange} required disabled={loading} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="reg-verticalType">نوع النشاط</Label>
                  <Select value={form.verticalType} onValueChange={(value) => setForm((prev) => ({ ...prev, verticalType: value }))}>
                    <SelectTrigger id="reg-verticalType" disabled={loading}>
                      <SelectValue placeholder="اختر نوع النشاط" />
                    </SelectTrigger>
                    <SelectContent>
                      {VERTICAL_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="reg-whatsappNumber">رقم واتساب (بكود الدولة)</Label>
                  <Input id="reg-whatsappNumber" name="whatsappNumber" type="text" placeholder="مثال: 201001234567" value={form.whatsappNumber} onChange={handleTextChange} required disabled={loading} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="reg-password">كلمة المرور</Label>
                  <Input id="reg-password" name="password" type="password" placeholder="••••••••" value={form.password} onChange={handleTextChange} required disabled={loading} />
                </div>
                {error && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "⏳ جارٍ التسجيل..." : "🚀 إنشاء حساب"}
                </Button>
              </div>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              عندك حساب؟{" "}
              <Link href="/login" className="font-semibold text-primary hover:text-primary/80 transition-colors">سجّل دخول</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
