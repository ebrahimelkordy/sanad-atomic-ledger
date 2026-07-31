/**
 * القاعدة #1 و #3: InventoryProductRepository
 *   - DEFENSIVE VALIDATION: Zod قبل كل عمليات الكتابة + SKU آمن وفريد.
 *   - DETERMINISTIC INVENTORY: عدم افتراض كمية = 1 أبداً كمصدر وحيد للكمية.
 */
import { Injectable } from '@nestjs/common';
import { InventoryProduct, Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import {
  InventoryProductCreateSchema,
  ValidatedInventoryProductPayload,
  deterministicallyParseInventoryPricing,
} from '../validation';
import { sanitizeSku, generateSafeSku } from '../validation';

export type CreateInventoryProductInput = ValidatedInventoryProductPayload & {
  tenant_id: string;
  /** نص الرسالة الأصلية، مُستخدم فقط للـ Deterministic extraction إذا لم تكتمل القيم. */
  rawMessageText?: string;
};

@Injectable()
export class InventoryProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  private static normalize(input: CreateInventoryProductInput) {
    // 1) محاولة تطبيق Zod أولاً
    const partially = InventoryProductCreateSchema.partial().safeParse(input);
    const partial = partially.success ? partially.data : {};

    // 2) استخراج حاسم للكميات والأسعار من السياق إذا لم تكتمل
    const deterministic = deterministicallyParseInventoryPricing({
      rawMessageText: input.rawMessageText,
      rawExtracted: input as Record<string, unknown>,
    });

    const finalQty =
      typeof partial.current_stock === 'number' && partial.current_stock > 0
        ? partial.current_stock
        : deterministic.current_stock ?? 0; // LAST RESORT 0 (وليس 1)

    const finalUnit =
      typeof partial.unit_price === 'number' && partial.unit_price > 0
        ? partial.unit_price
        : deterministic.unit_price ?? 0;

    const finalCost =
      typeof partial.cost_price === 'number' && partial.cost_price > 0
        ? partial.cost_price
        : deterministic.cost_price ?? 0;

    // 3) تشديد: إذا لم يجد لامشروشية لاسم صالح → نرفض بValidation error صريح
    if (!input.name || String(input.name).trim().length < 2) {
      throw new Error('VALIDATION_ERROR: اسم المنتج مطلوب ومدعوم بقيمة صريحة أو مستخرجة من النص.');
    }

    const raw = InventoryProductCreateSchema.parse({
      name: input.name,
      sku: input.sku,
      current_stock: finalQty,
      unit_price: finalUnit,
      cost_price: finalCost,
      vertical_metadata: (input as any).vertical_metadata ?? {},
    });

    // 4) تنظيف وتأمين SKU مع توليد fallback آمن
    const safeSku = sanitizeSku(raw.sku, () =>
      generateSafeSku(raw.name.slice(0, 4).toUpperCase() || 'PROD'),
    );

    return {
      tenant_id: input.tenant_id,
      name: raw.name.trim(),
      sku: safeSku,
      unit_price: raw.unit_price,
      cost_price: raw.cost_price ?? 0,
      current_stock: raw.current_stock,
      vertical_metadata: (raw.vertical_metadata ?? {}) as Prisma.InputJsonValue,
    };
  }

  async findByTenantId(tenantId: string, tx?: Prisma.TransactionClient): Promise<InventoryProduct[]> {
    const client = tx ?? this.prisma;
    return client.inventoryProduct.findMany({
      where: { tenant_id: tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findByTenantAndSku(
    tenantId: string,
    sku: string,
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryProduct | null> {
    const client = tx ?? this.prisma;
    return client.inventoryProduct.findUnique({
      where: { tenant_id_sku: { tenant_id: tenantId, sku } },
    });
  }

  async findByTenantAndName(
    tenantId: string,
    name: string,
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryProduct[]> {
    const client = tx ?? this.prisma;
    return client.inventoryProduct.findMany({
      where: {
        tenant_id: tenantId,
        name: { contains: name, mode: 'insensitive' },
      },
    });
  }

  /**
   * Upsert آمن للمنتجات:
   *   - إذا كان موجوداً بـ SKU أو بالاسم → زيادة المخزون فقط مع تحديث الأسعار إن كانت قيم صريحة غير صفري.
   *   - إذا غير موجود → إدراج جديد.
   *   - محمي بـ P2002 مع fallback regenerate SKU.
   */
  async upsertProduct(
    input: CreateInventoryProductInput,
    tx?: Prisma.TransactionClient,
  ): Promise<{ product: InventoryProduct; created: boolean; updatedQty: number }> {
    const client = tx ?? this.prisma;
    const normalized = InventoryProductRepository.normalize(input);

    let existing = await this.findByTenantAndSku(input.tenant_id, normalized.sku, tx);
    if (!existing) {
      const byName = await this.findByTenantAndName(input.tenant_id, normalized.name, tx);
      existing = byName[0] ?? null;
    }

    if (existing) {
      const existingCost = Number((existing as any).cost_price ?? 0);
      const merged = await client.inventoryProduct.update({
        where: { id: existing.id },
        data: {
          current_stock: existing.current_stock + normalized.current_stock,
          unit_price: normalized.unit_price > 0 ? normalized.unit_price : existing.unit_price,
          cost_price: normalized.cost_price > 0 ? normalized.cost_price : existingCost,
        },
      });
      return { product: merged, created: false, updatedQty: normalized.current_stock };
    }

    try {
      const created = await client.inventoryProduct.create({ data: normalized });
      return { product: created, created: true, updatedQty: normalized.current_stock };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const safeSku = generateSafeSku(normalized.name.slice(0, 4) + '-DUPE');
        const fallback = await client.inventoryProduct.create({
          data: { ...normalized, sku: safeSku },
        });
        return { product: fallback, created: true, updatedQty: normalized.current_stock };
      }
      throw e;
    }
  }

  async createProduct(
    data: CreateInventoryProductInput,
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryProduct> {
    const r = await this.upsertProduct(data, tx);
    return r.product;
  }

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

  async decrementStockWithLock(
    productId: string,
    quantity: number,
    tx: Prisma.TransactionClient,
  ): Promise<InventoryProduct> {
    if (quantity <= 0) throw new Error('كمية الخصم يجب أن تكون موجبة');
    return tx.inventoryProduct.update({
      where: { id: productId },
      data: { current_stock: { decrement: quantity } },
    });
  }

  async incrementStock(
    productId: string,
    quantity: number,
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryProduct> {
    const client = tx ?? this.prisma;
    if (quantity <= 0) throw new Error('كمية الزيادة يجب أن تكون موجبة');
    return client.inventoryProduct.update({
      where: { id: productId },
      data: { current_stock: { increment: quantity } },
    });
  }
}
