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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { ShoppingBag, Plus, RefreshCw, AlertCircle, TrendingUp, DollarSign, Ban, CreditCard } from "lucide-react";

export default function SalesPage() {
  const [sales, setSales] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // حالة إنشاء فاتورة مبيعات جديدة
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState("");
  const [saleType, setSaleType] = useState<"CASH" | "CREDIT">("CASH");
  const [paidAmountInput, setPaidAmountInput] = useState("");
  const [selectedItems, setSelectedItems] = useState<Array<{ product_id: string; quantity: number; selling_price: number }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // حالة تحصيل سداد للفاتورة
  const [payOpen, setPayOpen] = useState(false);
  const [selectedSaleForPay, setSelectedSaleForPay] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payMsg, setPayMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [salesData, inventoryData] = await Promise.all([
        api.getSales().catch(() => []),
        api.getInventory().catch(() => []),
      ]);
      setSales(salesData || []);
      setInventory(inventoryData || []);
    } catch (err: any) {
      setError(err.message || "فشل تحميل المبيعات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddItem = (productId: string) => {
    const product = inventory.find((p) => p.id === productId);
    if (!product) return;
    if (selectedItems.some((i) => i.product_id === productId)) return;

    setSelectedItems([
      ...selectedItems,
      { product_id: productId, quantity: 1, selling_price: Number(product.unit_price) },
    ]);
  };

  const handleRemoveItem = (productId: string) => {
    setSelectedItems(selectedItems.filter((i) => i.product_id !== productId));
  };

  const handleItemQuantityChange = (productId: string, qty: number) => {
    if (qty < 1) return;
    setSelectedItems(
      selectedItems.map((i) => (i.product_id === productId ? { ...i, quantity: qty } : i))
    );
  };

  // حساب الإجمالي التلقائي والربح المباشر المتوقع
  const calculatedTotal = selectedItems.reduce((acc, item) => acc + item.quantity * item.selling_price, 0);
  const calculatedProfit = selectedItems.reduce((acc, item) => {
    const prod = inventory.find((p) => p.id === item.product_id);
    const cost = prod ? Number(prod.cost_price || 0) : 0;
    return acc + item.quantity * (item.selling_price - cost);
  }, 0);

  const handleCreateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || selectedItems.length === 0) return;
    setSubmitting(true);
    setMsg(null);
    try {
      await api.createSale({
        customer_identifier: customer,
        sale_type: saleType,
        paid_amount: saleType === "CREDIT" && paidAmountInput ? parseFloat(paidAmountInput) : undefined,
        items: selectedItems,
      });
      setMsg({ type: "success", text: "تم تسجيل فاتورة المبيعات بنجاح!" });
      setCustomer("");
      setSelectedItems([]);
      setPaidAmountInput("");
      await fetchData();
      setTimeout(() => { setOpen(false); setMsg(null); }, 1500);
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "حدث خطأ أثناء إنشاء الفاتورة" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSale = async (saleId: string) => {
    if (!confirm("هل أنت تأكد من إلغاء الفاتورة وعكس تأثيرها على المخزون والذمم؟")) return;
    try {
      await api.cancelSale(saleId);
      fetchData();
    } catch (err: any) {
      alert(err.message || "فشل إلغاء الفاتورة");
    }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleForPay || !payAmount) return;
    setPaySubmitting(true);
    setPayMsg(null);
    try {
      await api.addSalePayment(selectedSaleForPay.id, parseFloat(payAmount));
      setPayMsg({ type: "success", text: "تم تسجيل التحصيل وتحديث حساب العميل!" });
      setPayAmount("");
      await fetchData();
      setTimeout(() => { setPayOpen(false); setPayMsg(null); }, 1500);
    } catch (err: any) {
      setPayMsg({ type: "error", text: err.message || "حدث خطأ أثناء السداد" });
    } finally {
      setPaySubmitting(false);
    }
  };

  // إحصائيات المبيعات والأرباح
  const totalSalesAmount = sales.filter((s) => s.status === "CONFIRMED").reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  const totalProfitAmount = sales.filter((s) => s.status === "CONFIRMED").reduce((sum, s) => sum + Number(s.total_profit || 0), 0);
  const totalRemainingDebt = sales.filter((s) => s.status === "CONFIRMED").reduce((sum, s) => sum + Number(s.remaining_amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* الترويسة */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">إدارة المبيعات والذمم</h1>
          <p className="text-sm text-muted-foreground mt-1">إصدار فواتير كاش وآجل وحساب الأرباح التلقائي</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>فاتورة مبيعات جديدة</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>إصدار فاتورة مبيعات جديدة</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateSale} className="space-y-4 pt-2">
                <div className="grid gap-2">
                  <Label htmlFor="s-customer">اسم أو رقم العميل</Label>
                  <Input
                    id="s-customer"
                    placeholder="مثال: سوبرماركت الأمل أو 01012345678"
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                    required
                    disabled={submitting}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>نوع البيع</Label>
                    <Select value={saleType} onValueChange={(v) => setSaleType(v as any)} disabled={submitting}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CASH">نقدي (CASH)</SelectItem>
                        <SelectItem value="CREDIT">آجل / بالتقسيط (CREDIT)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {saleType === "CREDIT" && (
                    <div className="grid gap-2">
                      <Label htmlFor="s-paid">المبلغ المدفوع مقدمًا</Label>
                      <Input
                        id="s-paid"
                        type="number"
                        min="0"
                        placeholder="0.00"
                        value={paidAmountInput}
                        onChange={(e) => setPaidAmountInput(e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                  )}
                </div>

                {/* اختيار المنتجات */}
                <div className="space-y-2 border-t pt-3">
                  <Label>إضافة منتجات للفاتورة</Label>
                  <Select onValueChange={handleAddItem} disabled={submitting}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر منتجًا لإضافته..." />
                    </SelectTrigger>
                    <SelectContent>
                      {inventory.map((p) => (
                        <SelectItem key={p.id} value={p.id} disabled={p.current_stock <= 0}>
                          {p.name} — سعر: {p.unit_price} ج.م (المخزون: {p.current_stock})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* قائمة المنتجات المختارة */}
                  <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                    {selectedItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">لم يتم اختيار أية منتجات بعد</p>
                    ) : (
                      selectedItems.map((item) => {
                        const prod = inventory.find((p) => p.id === item.product_id);
                        return (
                          <div key={item.product_id} className="flex items-center justify-between gap-2 text-sm border-b pb-2">
                            <span className="font-medium flex-1 truncate">{prod?.name}</span>
                            <div className="flex items-center gap-1 w-24">
                              <Input
                                type="number"
                                min="1"
                                max={prod?.current_stock}
                                className="h-7 text-center px-1"
                                value={item.quantity}
                                onChange={(e) => handleItemQuantityChange(item.product_id, parseInt(e.target.value) || 1)}
                              />
                            </div>
                            <span className="font-semibold text-xs w-20 text-left">
                              {(item.quantity * item.selling_price).toFixed(2)} ج.م
                            </span>
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleRemoveItem(item.product_id)}>
                              ×
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* الملخص الفوري للفاتورة والأرباح */}
                <div className="bg-muted/50 p-3 rounded-lg flex items-center justify-between text-sm">
                  <div>
                    <span className="text-muted-foreground block text-xs">إجمالي الفاتورة:</span>
                    <span className="font-bold text-base">{calculatedTotal.toFixed(2)} ج.م</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">الربح المتوقع:</span>
                    <span className="font-bold text-base text-emerald-600">+{calculatedProfit.toFixed(2)} ج.م</span>
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
                  <Button type="submit" disabled={submitting || selectedItems.length === 0 || !customer}>
                    {submitting ? "جارٍ الإصدار..." : "إصدار الفاتورة"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* بطاقات الكيبيآي */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي مبيعات التأكيد</CardTitle>
            <ShoppingBag className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">EGP {totalSalesAmount.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي الأرباح المحققة</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">EGP {totalProfitAmount.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">متبقي الذمم للعملاء</CardTitle>
            <DollarSign className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">EGP {totalRemainingDebt.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {/* جدول الفواتير */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">سجل الفواتير</CardTitle>
          <CardDescription>عرض تفصيلي لجميع فواتير المبيعات وحالتها</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : error ? (
            <div className="p-6 text-destructive">{error}</div>
          ) : sales.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">لا توجد فواتير مبيعات مسجلة حتى الآن</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">رقم الفاتورة</TableHead>
                  <TableHead className="text-right">العميل</TableHead>
                  <TableHead className="text-right">نوع البيع</TableHead>
                  <TableHead className="text-right">الإجمالي</TableHead>
                  <TableHead className="text-right">المدفوع / المتبقي</TableHead>
                  <TableHead className="text-right">الربح</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => {
                  const isCancelled = sale.status === "CANCELLED";
                  const remaining = Number(sale.remaining_amount || 0);

                  return (
                    <TableRow key={sale.id} className={isCancelled ? "opacity-50 line-through bg-muted/20" : ""}>
                      <TableCell className="font-mono font-bold text-xs">{sale.invoice_number}</TableCell>
                      <TableCell className="font-medium">{sale.customer_identifier}</TableCell>
                      <TableCell>
                        <Badge variant={sale.sale_type === "CASH" ? "secondary" : "outline"}>
                          {sale.sale_type === "CASH" ? "كاش" : "آجل"}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular font-semibold">EGP {Number(sale.total_amount).toFixed(2)}</TableCell>
                      <TableCell className="tabular text-xs">
                        <div className="text-emerald-600 font-medium">مدفوع: {Number(sale.paid_amount).toFixed(2)}</div>
                        {remaining > 0 && <div className="text-destructive font-bold">متبقي: {remaining.toFixed(2)}</div>}
                      </TableCell>
                      <TableCell className="tabular font-bold text-emerald-600">
                        +EGP {Number(sale.total_profit).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isCancelled ? "destructive" : "default"}>
                          {isCancelled ? "ملغاة" : "مؤكدة"}
                        </Badge>
                      </TableCell>
                      <TableCell className="flex items-center gap-1">
                        {!isCancelled && remaining > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedSaleForPay(sale);
                              setPayOpen(true);
                            }}
                            className="h-8 gap-1 text-xs"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            <span>سداد</span>
                          </Button>
                        )}
                        {!isCancelled && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleCancelSale(sale.id)}
                            title="إلغاء الفاتورة (Reverse Sale)"
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
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

      {/* نافذة تحصيل سداد فاتورة */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تحصيل سداد للفاتورة #{selectedSaleForPay?.invoice_number}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddPayment} className="space-y-4 pt-2">
            <div className="text-sm border-b pb-2">
              <span className="text-muted-foreground">العميل: </span>
              <span className="font-semibold">{selectedSaleForPay?.customer_identifier}</span>
              <div className="text-destructive font-bold mt-1">
                المتبقي حالياً: {Number(selectedSaleForPay?.remaining_amount || 0).toFixed(2)} ج.م
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-amount">مبلغ التحصيل (ج.م)</Label>
              <Input
                id="p-amount"
                type="number"
                min="0.01"
                max={selectedSaleForPay?.remaining_amount}
                step="0.01"
                placeholder="0.00"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
                disabled={paySubmitting}
              />
            </div>
            {payMsg && (
              <div className={`p-3 rounded-md text-sm ${payMsg.type === "success" ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
                {payMsg.text}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayOpen(false)} disabled={paySubmitting}>
                إلغاء
              </Button>
              <Button type="submit" disabled={paySubmitting || !payAmount}>
                {paySubmitting ? "جارٍ السداد..." : "تأكيد التحصيل"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
