export interface LowStockAlert { productId: string; sku: string; name: string; current: number; threshold: number; reorder?: number; }
export interface ExpiryAlert   { productId: string; sku: string; name: string; qty: number; expiryDate: Date; critical: boolean; }

export class InventoryAlertsPolicy {
  static detectLowStock(products: Array<{ id: string; sku: string; name: string; current_stock: number; low_stock_threshold: number | null; reorder_quantity: number | null; }>): LowStockAlert[] {
    return products
      .filter((p) => p.low_stock_threshold != null && p.current_stock <= p.low_stock_threshold)
      .map((p) => ({ productId: p.id, sku: p.sku, name: p.name, current: p.current_stock, threshold: p.low_stock_threshold!, reorder: p.reorder_quantity ?? undefined }));
  }

  static detectExpiry(batches: Array<{ id: string; product_id: string; product?: { name: string; sku: string } | null; quantity_remaining: number; expiry_date: Date | null; received_date: Date; }>, now = new Date()): ExpiryAlert[] {
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in7  = new Date(now.getTime() +  7 * 24 * 60 * 60 * 1000);
    return batches
      .filter((b) => b.quantity_remaining > 0 && b.expiry_date && b.expiry_date >= now && b.expiry_date <= in30)
      .sort((a, b) => a.expiry_date!.getTime() - b.expiry_date!.getTime())
      .map((b) => ({ productId: b.product_id, sku: b.product?.sku ?? '', name: b.product?.name ?? '', qty: b.quantity_remaining, expiryDate: b.expiry_date!, critical: b.expiry_date! <= in7 }));
  }
}