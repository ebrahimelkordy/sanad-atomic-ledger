import { Injectable } from '@nestjs/common';
import {
  InventoryProduct,
  OrderStatus as OrderStatusEnum,
} from '@prisma/client';

import { CustomerOrderRepository } from '../repositories/customer-order.repository';
import { InventoryProductRepository } from '../repositories/inventory-product.repository';
import { LedgerEntryRepository } from '../repositories/ledger-entry.repository';
import { TransactionRunner } from '../repositories/transaction-runner.service';
import { isSourceWhatsappMessageIdConflict } from './idempotency.util';
import { InsufficientStockException } from './insufficient-stock.exception';

export type ExtractedOrderItem = {
  productNameOrSku: string;
  quantity: number;
};

type ProcessOrderResult =
  | {
      order_status: OrderStatusEnum;
      order_id: string;
      invoice_text: string;
      order_details: Array<{
        product_id: string;
        quantity_ordered: number;
        unit_price_at_order: string;
      }>;
      grand_total: string;
    }
  | {
      order_status: OrderStatusEnum;
      order_id: string;
      rejection_text: string;
      grand_total: string;
    }
  | {
      order_status: OrderStatusEnum;
      rejection_text: string;
    };

@Injectable()
export class OrderProcessorService {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly inventoryProductRepository: InventoryProductRepository,
    private readonly customerOrderRepository: CustomerOrderRepository,
    private readonly ledgerEntryRepository: LedgerEntryRepository,
  ) {}

  private decimalLikeToString(value: unknown): string {
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && 'toString' in value) {
      return String((value as { toString: () => string }).toString());
    }
    return '';
  }

  /**
   * Validates extracted items against inventory.
   * Returns either resolved products or a rejection reason.
   */
  private async resolveItems(
    tenantId: string,
    extractedItems: ExtractedOrderItem[],
  ): Promise<
    | {
        ok: true;
        items: Array<{ product: InventoryProduct; quantity: number }>;
        grandTotal: number;
      }
    | { ok: false; rejectionText: string }
  > {
    for (const item of extractedItems) {
      if (!item || typeof item.quantity !== 'number' || item.quantity <= 0) {
        return { ok: false, rejectionText: 'الكمية يجب أن تكون أكبر من صفر.' };
      }

      const identifier = (item.productNameOrSku ?? '').trim();
      if (!identifier) {
        return {
          ok: false,
          rejectionText: 'منتج غير معروف. رجاءً تأكد من اسم/رمز المنتج.',
        };
      }

      const skuMatch = await this.inventoryProductRepository.findByTenantAndSku(
        tenantId,
        identifier,
      );
      if (skuMatch) continue;

      const byName = await this.inventoryProductRepository.findByTenantAndName(
        tenantId,
        identifier,
      );
      if (!byName || byName.length === 0) {
        return {
          ok: false,
          rejectionText: 'منتج غير معروف. رجاءً تأكد من اسم/رمز المنتج.',
        };
      }
      if (byName.length > 1) {
        return {
          ok: false,
          rejectionText: `مش قادر أحدد المنتج بالظبط، تقصد ${byName[0].name} ولا ${byName[1].name}؟`,
        };
      }
    }

    // Resolve all products fully
    const resolved = await Promise.all(
      extractedItems.map(async (item) => {
        const skuMatch =
          await this.inventoryProductRepository.findByTenantAndSku(
            tenantId,
            item.productNameOrSku.trim(),
          );
        if (skuMatch) return { product: skuMatch, quantity: item.quantity };

        const byName =
          await this.inventoryProductRepository.findByTenantAndName(
            tenantId,
            item.productNameOrSku.trim(),
          );
        return { product: byName[0], quantity: item.quantity };
      }),
    );

    const grandTotal = resolved
      .map(({ product, quantity }) => Number(product.unit_price) * quantity)
      .reduce((a, b) => a + b, 0);

    return { ok: true, items: resolved, grandTotal };
  }

  /**
   * Step 05 Sequence Flow 1
   */
  async processOrder(
    tenantId: string,
    customerWhatsapp: string,
    extractedItems: ExtractedOrderItem[],
    whatsappMessageId: string,
    rawMessageText: string,
  ): Promise<ProcessOrderResult> {
    // 1) Validate items first
    const resolved = await this.resolveItems(tenantId, extractedItems);
    if (!resolved.ok) {
      return {
        order_status: OrderStatusEnum.REJECTED_INSUFFICIENT_STOCK,
        rejection_text: resolved.rejectionText,
      };
    }

    const { items, grandTotal } = resolved;

    try {
      const result = await this.tx.run(async (txClient) => {
        // Lock and check stock for each product
        for (const { product, quantity } of items) {
          const locked = await this.inventoryProductRepository.lockForUpdate(
            product.id,
            txClient,
          );
          if (!locked) {
            throw new Error('UNKNOWN_PRODUCT');
          }
          if (locked.current_stock < quantity) {
            throw new InsufficientStockException();
          }
        }

        // Decrement stock
        for (const { product, quantity } of items) {
          await this.inventoryProductRepository.decrementStockWithLock(
            product.id,
            quantity,
            txClient,
          );
        }

        // Create order with details
        const createdOrder =
          await this.customerOrderRepository.createOrderWithDetails(
            {
              tenant_id: tenantId,
              customer_whatsapp: customerWhatsapp,
              grand_total: grandTotal,
              source_whatsapp_message_id: whatsappMessageId,
              raw_message_text: rawMessageText,
            },
            items.map(({ product, quantity }) => ({
              product_id: product.id,
              quantity_ordered: quantity,
              unit_price_at_order: product.unit_price,
            })),
            txClient,
          );

        // Append DEBIT ledger entry
        await this.ledgerEntryRepository.appendLedgerEntry(
          {
            tenant_id: tenantId,
            party_identifier: customerWhatsapp,
            entry_type: 'DEBIT',
            amount: grandTotal,
            reference_order_id: createdOrder.id,
            authorized_action_by: null,
            source_whatsapp_message_id: whatsappMessageId,
            raw_message_text: rawMessageText,
          },
          txClient,
        );

        return {
          order_status: createdOrder.order_status,
          order_id: createdOrder.id,
          invoice_text: 'تم تأكيد طلبك بنجاح.',
          order_details: createdOrder.order_details.map((od) => ({
            product_id: od.product_id,
            quantity_ordered: od.quantity_ordered,
            unit_price_at_order: od.unit_price_at_order.toString(),
          })),
          grand_total: grandTotal.toString(),
        };
      });

      return result;
    } catch (err) {
      if (err instanceof InsufficientStockException) {
        try {
          const rejected =
            await this.customerOrderRepository.createRejectedOrder({
              tenant_id: tenantId,
              customer_whatsapp: customerWhatsapp,
              grand_total: grandTotal,
              source_whatsapp_message_id: whatsappMessageId,
              raw_message_text: rawMessageText,
            });
          return {
            order_status: rejected.order_status,
            order_id: rejected.id,
            rejection_text: 'عذرًا، المخزون غير كافٍ لتنفيذ الأوردر كاملًا.',
            grand_total: grandTotal.toString(),
          };
        } catch (rejErr) {
          if (isSourceWhatsappMessageIdConflict(rejErr)) {
            const existing =
              await this.customerOrderRepository.findBySourceMessageId(
                whatsappMessageId,
              );
            if (existing) {
              return {
                order_status: existing.order_status,
                order_id: existing.id,
                rejection_text:
                  'عذرًا، المخزون غير كافٍ لتنفيذ الأوردر كاملًا.',
                grand_total: this.decimalLikeToString(existing.grand_total),
              };
            }
          }
          throw rejErr;
        }
      }

      // Idempotency: if unique constraint violation on source_whatsapp_message_id
      if (isSourceWhatsappMessageIdConflict(err)) {
        const existing =
          await this.customerOrderRepository.findBySourceMessageId(
            whatsappMessageId,
          );
        if (!existing) throw err;

        if (existing.order_status === OrderStatusEnum.CONFIRMED) {
          return {
            order_status: existing.order_status,
            order_id: existing.id,
            invoice_text: 'تم تأكيد طلبك بنجاح.',
            order_details: existing.order_details.map((od) => ({
              product_id: od.product_id,
              quantity_ordered: od.quantity_ordered,
              unit_price_at_order: this.decimalLikeToString(
                od.unit_price_at_order,
              ),
            })),
            grand_total: this.decimalLikeToString(existing.grand_total),
          };
        }

        return {
          order_status: existing.order_status,
          order_id: existing.id,
          rejection_text: 'عذرًا، المخزون غير كافٍ لتنفيذ الأوردر كاملًا.',
          grand_total: this.decimalLikeToString(existing.grand_total),
        };
      }

      throw err;
    }
  }
}
