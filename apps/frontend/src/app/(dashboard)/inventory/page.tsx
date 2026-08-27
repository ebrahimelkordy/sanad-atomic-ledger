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
import { Package, Plus, AlertCircle, RefreshCw, TrendingUp, History } from "lucide-react";

function getStockBadge(stock: number) {
  if (stock === 0) {
    return <Badge variant="destructive">نفد المخزون (0)</Badge>;
  }
  if (stock < 10) {
    return <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-50/50">{stock} قطع (منخفض)</Badge>;
  }
  return <Badge variant="secondary" className="text-emerald-700 bg-emerald-50">{stock} قطعة</Badge>;
}

export default function InventoryPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // نموذج إضافة منتج جديد
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ sku: "", name: "", unit_price: "", cost_price: "", current_stock: "" });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // نموذج تعديل السعر غير الرجعي
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [priceForm, setPriceForm] = useState({
    new_unit_price: "",
    new_cost_price: "",
    change_reason: "SUPPLIER_INCREASE" as any,
    notes: "",
    effective_date: new Date().toISOString().slice(0, 10),
  });
  const [priceSubmitting, setPriceSubmitting] = useState(false);

  // حوار عرض سجل تاريخ الأسعار
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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

  const handleUpdatePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setPriceSubmitting(true);
    try {
      await api.updateProductPrice(selectedProduct.id, {
        new_unit_price: parseFloat(priceForm.new_unit_price) || undefined,
        new_cost_price: parseFloat(priceForm.new_cost_price) || undefined,
        change_reason: priceForm.change_reason,
        notes: priceForm.notes || undefined,
        effective_date: priceForm.effective_date || undefined,
      });
      await fetchProducts();
      setPriceDialogOpen(false);
    } catch (err: any) {
      alert(err.message || "حدث خطأ أثناء تعديل السعر");
    } finally {
      setPriceSubmitting(false);
    }
  };

  const openPriceModal = (product: any) => {
    setSelectedProduct(product);
    setPriceForm({
      new_unit_price: String(product.unit_price || ""),
      new_cost_price: String(product.cost_price || ""),
      change_reason: "SUPPLIER_INCREASE",
      notes: "",
      effective_date: new Date().toISOString().slice(0, 10),
    });
    setPriceDialogOpen(true);
  };

  const openHistoryModal = async (product: any) => {
    setSelectedProduct(product);
    setHistoryLoading(true);
    setHistoryDialogOpen(true);
    try {
      const data = await api.getProductPriceHistory(product.id);
      setPriceHistory(data || []);
    } catch (err) {
      setPriceHistory([]);
    } finally {
      setHistoryLoading(false);
    }
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
                  <TableHead className="text-right">إجراءات الأسعار</TableHead>
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
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => openPriceModal(product)}>
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                            تعديل السعر
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openHistoryModal(product)} title="سجل تغييرات الأسعار">
                            <History className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* حوار تعديل أسعار المنتج بصفة غير رجعية */}
      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل سعر المنتج (بدون أثر رجعي)</DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <form onSubmit={handleUpdatePrice} className="space-y-4 pt-2">
              <div className="text-sm font-medium border-b pb-2">
                المنتج: <span className="text-primary">{selectedProduct.name}</span> ({selectedProduct.sku})
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>سعر البيع الجديد (ج.م)</Label>
                  <Input type="number" min="0" step="0.01" value={priceForm.new_unit_price} onChange={(e) => setPriceForm({ ...priceForm, new_unit_price: e.target.value })} required disabled={priceSubmitting} />
                </div>
                <div className="grid gap-2">
                  <Label>سعر التكلفة الجديد (ج.م)</Label>
                  <Input type="number" min="0" step="0.01" value={priceForm.new_cost_price} onChange={(e) => setPriceForm({ ...priceForm, new_cost_price: e.target.value })} required disabled={priceSubmitting} />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>سبب تعديل السعر</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={priceForm.change_reason} onChange={(e) => setPriceForm({ ...priceForm, change_reason: e.target.value as any })} disabled={priceSubmitting}>
                  <option value="SUPPLIER_INCREASE">زيادة سعر المورد / التكلفة</option>
                  <option value="MARKET_REPRICE">إعادة تسعير سوقية جديدة</option>
                  <option value="PERIODIC_REVIEW">مراجعة دورية للأرباح</option>
                  <option value="CORRECTION">تصحيح خطأ تسعير سابق</option>
                  <option value="OTHER">أسباب أخرى</option>
                </select>
              </div>

              <div className="grid gap-2">
                <Label>تاريخ بدء تطبيق السعر الجديد</Label>
                <Input type="date" value={priceForm.effective_date} onChange={(e) => setPriceForm({ ...priceForm, effective_date: e.target.value })} required disabled={priceSubmitting} />
              </div>

              <div className="grid gap-2">
                <Label>ملاحظات إضافية</Label>
                <Input placeholder="مثال: زيادة الفاتورة من المورد بنسبة 10%..." value={priceForm.notes} onChange={(e) => setPriceForm({ ...priceForm, notes: e.target.value })} disabled={priceSubmitting} />
              </div>

              <div className="p-3 bg-muted/40 border rounded-lg text-xs text-muted-foreground">
                🔒 <b>ضمان الأثر غير الرجعي:</b> جميع المبيعات والطلبيات السابقة ستظل محفوظة بأسعارها وقت البيع دون أي تغيير في الأرباح التاريخية.
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPriceDialogOpen(false)} disabled={priceSubmitting}>إلغاء</Button>
                <Button type="submit" disabled={priceSubmitting}>{priceSubmitting ? "جارٍ الحفظ..." : "حفظ السعر الجديد"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* حوار عرض سجل تاريخ التغييرات في أسعار المنتج */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              سجل التغييرات التاريخية لأسعار المنتج
            </DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <div className="space-y-4 pt-2">
              <div className="text-sm font-medium border-b pb-2">
                المنتج: <span className="text-primary">{selectedProduct.name}</span> ({selectedProduct.sku})
              </div>

              {historyLoading ? (
                <div className="space-y-2 py-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : priceHistory.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  لم يتم تسجيل أي تعديلات سابقة على أسعار هذا المنتج.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">التاريخ الفعلي</TableHead>
                      <TableHead className="text-right">سعر البيع</TableHead>
                      <TableHead className="text-right">سعر التكلفة</TableHead>
                      <TableHead className="text-right">السبب</TableHead>
                      <TableHead className="text-right">ملاحظات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priceHistory.map((h: any) => {
                      const reasonMap: Record<string, string> = {
                        SUPPLIER_INCREASE: "زيادة سعر المورد",
                        MARKET_REPRICE: "تسعيرة سوقية جديدة",
                        PERIODIC_REVIEW: "مراجعة دورية",
                        CORRECTION: "تصحيح خطأ",
                        OTHER: "أخرى",
                      };
                      return (
                        <TableRow key={h.id}>
                          <TableCell className="text-sm font-medium">
                            {new Date(h.effective_date || h.created_at).toLocaleDateString("ar-EG")}
                          </TableCell>
                          <TableCell className="tabular">
                            <span className="text-xs text-muted-foreground block">القديم: EGP {Number(h.old_unit_price).toFixed(2)}</span>
                            <span className="font-bold text-emerald-600">EGP {Number(h.new_unit_price).toFixed(2)}</span>
                          </TableCell>
                          <TableCell className="tabular">
                            <span className="text-xs text-muted-foreground block">القديم: EGP {Number(h.old_cost_price).toFixed(2)}</span>
                            <span className="font-bold">EGP {Number(h.new_cost_price).toFixed(2)}</span>
                          </TableCell>
                          <TableCell className="text-sm">{reasonMap[h.change_reason] || h.change_reason}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{h.notes || "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
