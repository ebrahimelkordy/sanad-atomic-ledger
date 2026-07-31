"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Package, Plus, AlertCircle, RefreshCw } from "lucide-react";

export default function InventoryPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // نموذج إضافة منتج جديد
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ sku: "", name: "", unit_price: "", cost_price: "", current_stock: "" });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getInventory();
      setProducts(data || []);
    } catch (err: any) {
      setError(err.message || "فشل تحميل بيانات المخزن");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      await api.createProduct(
        form.sku,
        form.name,
        parseFloat(form.unit_price) || 0,
        parseFloat(form.cost_price) || 0,
        parseInt(form.current_stock) || 0,
      );
      setMsg({ type: "success", text: "تم إضافة المنتج بنجاح!" });
      setForm({ sku: "", name: "", unit_price: "", cost_price: "", current_stock: "" });
      await fetchProducts();
      setTimeout(() => { setOpen(false); setMsg(null); }, 1500);
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "حدث خطأ أثناء إضافة المنتج" });
    } finally {
      setSubmitting(false);
    }
  };

  const getStockBadge = (stock: number) => {
    if (stock === 0) return <Badge variant="destructive">نفذ المخزون</Badge>;
    if (stock < 10) return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/40">{stock} متبقي</Badge>;
    return <Badge variant="secondary" className="text-emerald-600">{stock}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* الترويسة */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">المخزن والمنتجات</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة المنتجات والكميات المتاحة في النظام</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={fetchProducts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>إضافة منتج</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>إضافة منتج جديد للمخزن</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddProduct} className="space-y-4 pt-2">
                <div className="grid gap-2">
                  <Label htmlFor="p-name">اسم المنتج</Label>
                  <Input
                    id="p-name"
                    placeholder="مثال: بيبسي 500 مل"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    disabled={submitting}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-sku">كود المنتج (SKU)</Label>
                  <Input
                    id="p-sku"
                    placeholder="مثال: PEPSI-500"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    required
                    disabled={submitting}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="grid gap-2">
                    <Label htmlFor="p-price">سعر البيع (ج.م)</Label>
                    <Input
                      id="p-price"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={form.unit_price}
                      onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                      required
                      disabled={submitting}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="p-cost">التكلفة (ج.م)</Label>
                    <Input
                      id="p-cost"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={form.cost_price}
                      onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                      required
                      disabled={submitting}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="p-stock">الكمية المتاحة</Label>
                    <Input
                      id="p-stock"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={form.current_stock}
                      onChange={(e) => setForm({ ...form, current_stock: e.target.value })}
                      required
                      disabled={submitting}
                    />
                  </div>
                </div>
                {msg && (
                  <div className={`p-3 rounded-md text-sm ${msg.type === "success" ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
                    {msg.text}
                  </div>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                    إلغاء
                  </Button>
                  <Button type="submit" disabled={submitting || !form.sku || !form.name}>
                    {submitting ? "جارٍ الإضافة..." : "إضافة المنتج"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* بطاقات الإحصائيات */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي المنتجات</CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.length}</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">منتجات نفذت</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {products.filter((p) => p.current_stock === 0).length}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">كمية منخفضة</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              {products.filter((p) => p.current_stock > 0 && p.current_stock < 10).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* جدول المنتجات */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">قائمة المنتجات</CardTitle>
          <CardDescription>جميع المنتجات المسجلة في مخزن التينانت</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            </div>
          ) : products.length === 0 ? (
            <div className="py-16 text-center">
              <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground">لا توجد منتجات في المخزن حالياً</p>
              <p className="text-sm text-muted-foreground">اضغط على "إضافة منتج" لإضافة أول منتج</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">اسم المنتج</TableHead>
                  <TableHead className="text-right">SKU</TableHead>
                  <TableHead className="text-right">سعر البيع</TableHead>
                  <TableHead className="text-right">التكلفة</TableHead>
                  <TableHead className="text-right">الربح للقطعة</TableHead>
                  <TableHead className="text-right">الكمية</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product, idx) => {
                  const profitPerUnit = Number(product.unit_price || 0) - Number(product.cost_price || 0);
                  return (
                    <TableRow key={product.id || idx}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{product.sku}</TableCell>
                      <TableCell className="tabular font-semibold">
                        EGP {Number(product.unit_price || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="tabular text-muted-foreground">
                        EGP {Number(product.cost_price || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="tabular font-semibold text-emerald-600">
                        EGP {profitPerUnit.toFixed(2)}
                      </TableCell>
                      <TableCell>{getStockBadge(product.current_stock)}</TableCell>
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
