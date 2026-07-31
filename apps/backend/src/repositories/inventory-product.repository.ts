import { Injectable } from '@nestjs/common';
import { InventoryProduct, Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

@Injectable()
export class InventoryProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenantId(tenantId: string): Promise<InventoryProduct[]> {
    return this.prisma.inventoryProduct.findMany({
      where: { tenant_id: tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async createProduct(data: {
    tenant_id: string;
    sku: string;
    name: string;
    unit_price: number;
    cost_price?: number;
    current_stock: number;
    vertical_metadata?: Record<string, unknown>;
  }): Promise<InventoryProduct> {
    return this.prisma.inventoryProduct.create({
      data: {
        tenant_id: data.tenant_id,
        sku: data.sku,
        name: data.name,
        unit_price: data.unit_price,
        cost_price: data.cost_price ?? 0,
        current_stock: data.current_stock,
        vertical_metadata: (data.vertical_metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async findByTenantAndSku(
    tenantId: string,
    sku: string,
  ): Promise<InventoryProduct | null> {
    return this.prisma.inventoryProduct.findUnique({
      where: {
        tenant_id_sku: {
          tenant_id: tenantId,
          sku,
        },
      },
    });
  }

  async findByTenantAndName(
    tenantId: string,
    name: string,
  ): Promise<InventoryProduct[]> {
    return this.prisma.inventoryProduct.findMany({
      where: {
        tenant_id: tenantId,
        name: {
          contains: name,
          mode: 'insensitive',
        },
      },
    });
  }

  /**
   * Acquires a row-level lock via `SELECT ... FOR UPDATE`.
   * Must be called inside the caller's Prisma transaction (`tx`).
   */
  async lockForUpdate(
    productId: string,
    tx: Prisma.TransactionClient,
  ): Promise<InventoryProduct | null> {
    const rows = await tx.$queryRaw<InventoryProduct[]>`
      SELECT *
      FROM inventory_products
      WHERE id = ${productId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /**
   * Decrements stock. MUST be called after `lockForUpdate` within the same
   * transaction — calling without a prior lock risks a race condition.
   */
  async decrementStockWithLock(
    productId: string,
    quantity: number,
    tx: Prisma.TransactionClient,
  ): Promise<InventoryProduct> {
    return tx.inventoryProduct.update({
      where: { id: productId },
      data: {
        current_stock: {
          decrement: quantity,
        },
      },
    });
  }
}
