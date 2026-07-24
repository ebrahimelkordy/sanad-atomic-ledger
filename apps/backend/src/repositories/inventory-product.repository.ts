import { Injectable } from '@nestjs/common';
import { InventoryProduct, Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

@Injectable()
export class InventoryProductRepository {
  constructor(private readonly prisma: PrismaService) {}

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
