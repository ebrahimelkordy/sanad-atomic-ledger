import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../repositories/prisma.service';
import { IInventoryQueryPort, InventorySummaryRow, InventoryBatchRow } from '../../application/ports/i-inventory-query.port';

@Injectable()
export class PrismaInventoryQueryAdapter implements IInventoryQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findAllProductsByTenant(tenantId: string): Promise<InventorySummaryRow[]> {
    return this.prisma.inventoryProduct.findMany({
      where: { tenant_id: tenantId, is_active: true },
      select: { id: true, sku: true, name: true, current_stock: true, low_stock_threshold: true, reorder_quantity: true },
    });
  }

  async findExpiringBatches(tenantId: string, from: Date, toInclusive: Date): Promise<InventoryBatchRow[]> {
    return this.prisma.inventoryStockBatch.findMany({
      where: { tenant_id: tenantId, quantity_remaining: { gt: 0 }, expiry_date: { gte: from, lte: toInclusive } },
      orderBy: { expiry_date: 'asc' },
      include: { product: { select: { name: true, sku: true } } },
    });
  }

  async findWhatsAppRecipients(tenantId: string, role: 'AUTHORIZED_FINANCE' | 'PUBLIC_SALES'): Promise<string[]> {
    const rows = await this.prisma.tenantWhatsAppNumber.findMany({
      where: { tenant_id: tenantId, number_role: role },
      select: { phone_number: true },
    });
    return rows.map(r => r.phone_number).filter(Boolean);
  }
}