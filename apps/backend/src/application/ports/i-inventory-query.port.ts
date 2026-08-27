export interface InventorySummaryRow { id: string; sku: string; name: string; current_stock: number; low_stock_threshold: number | null; reorder_quantity: number | null; }
export interface InventoryBatchRow    { id: string; product_id: string; quantity_remaining: number; expiry_date: Date | null; received_date: Date; product?: { name: string; sku: string } | null; }

export interface IInventoryQueryPort {
  findAllProductsByTenant(tenantId: string): Promise<InventorySummaryRow[]>;
  findExpiringBatches(tenantId: string, from: Date, toInclusive: Date): Promise<InventoryBatchRow[]>;
  findWhatsAppRecipients(tenantId: string, role: 'AUTHORIZED_FINANCE' | 'PUBLIC_SALES'): Promise<string[]>;
}