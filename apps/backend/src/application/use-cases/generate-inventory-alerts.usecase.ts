import { Injectable, Logger } from '@nestjs/common';
import type { IInventoryQueryPort } from '../ports/i-inventory-query.port';
import type { IOutboxWriterPort } from '../ports/i-outbox-writer.port';
import { InventoryAlertsPolicy, LowStockAlert, ExpiryAlert } from '../../domain/policies/inventory-alerts.policy';

@Injectable()
export class GenerateInventoryAlertsUseCase {
  private readonly logger = new Logger(GenerateInventoryAlertsUseCase.name);

  constructor(
    private readonly query: IInventoryQueryPort,
    private readonly outbox: IOutboxWriterPort,
  ) {}

  /** يقوم هذا الـ Use Case بجولة على كل Tenants وينتج تنبيهات في الـ Outbox. */
  async executeForAllTenants(tenantIds: string[]): Promise<{ tenantId: string; queued: number }[]> {
    const results = [];
    for (const tenantId of tenantIds) results.push(await this.execute(tenantId));
    return results;
  }

  async execute(tenantId: string): Promise<{ tenantId: string; queued: number }> {
    const [products, batches, recipients] = await Promise.all([
      this.query.findAllProductsByTenant(tenantId),
      this.query.findExpiringBatches(tenantId, new Date(), new Date(Date.now() + 30*24*60*60*1000)),
      this.query.findWhatsAppRecipients(tenantId, 'AUTHORIZED_FINANCE'),
    ]);
    const low = InventoryAlertsPolicy.detectLowStock(products);
    const exp = InventoryAlertsPolicy.detectExpiry(batches);
    if (low.length === 0 && exp.length === 0) return { tenantId, queued: 0 };

    const body = this.formatMessage(low, exp);
    let queued = 0;
    for (const phone of recipients) {
      await this.outbox.enqueueWhatsAppText(tenantId, { to: phone, body, priority: exp.some(e=>e.critical) ? 2 : 1, correlation_id: `inv-alert-${tenantId}-${Date.now()}` });
      queued++;
    }
    this.logger.log(`Tenant ${tenantId}: queued ${queued} inventory alert messages (low=${low.length}, expiring=${exp.length})`);
    return { tenantId, queued };
  }

  private formatMessage(low: LowStockAlert[], exp: ExpiryAlert[]): string {
    const lines: string[] = [ '���🚨 تنبيهات المخزون التلقائية — نظام سند', `تاريخ: ${new Date().toLocaleString('ar-EG')}`, '' ];
    if (low.length) {
      lines.push('�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━');
      lines.push(`���📦 المنتجات تحت الحد الأدنى (${low.length} صنف):`);
      for (const p of low.slice(0,30)) lines.push(`• ${p.name} (${p.sku}) — المتاح: ${p.current} | الحد: ${p.threshold}${p.reorder ? ` | إعادة طلب مقترحة: ${p.reorder}` : ''}`);
      if (low.length > 30) lines.push(`  و ${low.length-30} صنف آخر...`);
      lines.push('');
    }
    const crit = exp.filter(e=>e.critical), norm = exp.filter(e=>!e.critical);
    if (crit.length) { lines.push('�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━'); lines.push(`���🔴 منتجات ستنتهي خلال 7 أيام (${crit.length}):`); for (const b of crit) lines.push(`• ${b.name} — الكمية: ${b.qty} — تاريخ: ${b.expiryDate.toISOString().slice(0,10)}`); lines.push(''); }
    if (norm.length) { lines.push('�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━'); lines.push(`���🟡 منتجات ستنتهي خلال 8-30 يوم (${norm.length}):`); for (const b of norm.slice(0,20)) lines.push(`• ${b.name} — الكمية: ${b.qty} — تاريخ: ${b.expiryDate.toISOString().slice(0,10)}`); lines.push(''); }
    lines.push('�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━�━'); lines.push('توليد تلقائي — نظام سند v1');
    return lines.join('\n');
  }
}