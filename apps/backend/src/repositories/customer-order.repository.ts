import { Injectable } from '@nestjs/common';
import {
  CustomerOrder,
  OrderDetail,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from './prisma.service';

export type CreateOrderData = {
  tenant_id: string;
  customer_whatsapp: string;
  grand_total: Prisma.Decimal | number | string;
  source_whatsapp_message_id: string;
  raw_message_text: string;
};

export type CreateOrderDetailData = {
  product_id: string;
  quantity_ordered: number;
  unit_price_at_order: Prisma.Decimal | number | string;
};

@Injectable()
export class CustomerOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inserts a CONFIRMED CustomerOrder with its OrderDetail children atomically.
   *
   * Unique constraint violation on `source_whatsapp_message_id` is the expected
   * idempotency guard (duplicate WhatsApp message) — not a random failure.
   * Callers (service layer) must catch it and use `findBySourceMessageId`.
   */
  async createOrderWithDetails(
    orderData: CreateOrderData,
    orderDetailsData: CreateOrderDetailData[],
    tx: Prisma.TransactionClient,
  ): Promise<CustomerOrder & { order_details: OrderDetail[] }> {
    return tx.customerOrder.create({
      data: {
        tenant_id: orderData.tenant_id,
        customer_whatsapp: orderData.customer_whatsapp,
        grand_total: orderData.grand_total,
        order_status: OrderStatus.CONFIRMED,
        source_whatsapp_message_id: orderData.source_whatsapp_message_id,
        raw_message_text: orderData.raw_message_text,
        order_details: {
          create: orderDetailsData.map((detail) => ({
            product_id: detail.product_id,
            quantity_ordered: detail.quantity_ordered,
            unit_price_at_order: detail.unit_price_at_order,
          })),
        },
      },
      include: { order_details: true },
    });
  }

  /**
   * Inserts a REJECTED_INSUFFICIENT_STOCK CustomerOrder only (no OrderDetail /
   * LedgerEntry).
   *
   * Unique constraint violation on `source_whatsapp_message_id` is the expected
   * idempotency guard — callers must catch it and use `findBySourceMessageId`.
   */
  async createRejectedOrder(
    orderData: CreateOrderData,
    tx?: Prisma.TransactionClient,
  ): Promise<CustomerOrder> {
    const client = tx ?? this.prisma;
    return client.customerOrder.create({
      data: {
        tenant_id: orderData.tenant_id,
        customer_whatsapp: orderData.customer_whatsapp,
        grand_total: orderData.grand_total,
        order_status: OrderStatus.REJECTED_INSUFFICIENT_STOCK,
        source_whatsapp_message_id: orderData.source_whatsapp_message_id,
        raw_message_text: orderData.raw_message_text,
      },
    });
  }

  async findBySourceMessageId(
    whatsappMessageId: string,
  ): Promise<(CustomerOrder & { order_details: OrderDetail[] }) | null> {
    return this.prisma.customerOrder.findUnique({
      where: { source_whatsapp_message_id: whatsappMessageId },
      include: { order_details: true },
    });
  }

  async findByTenantAndCustomer(
    tenantId: string,
    customerWhatsapp: string,
  ): Promise<CustomerOrder[]> {
    return this.prisma.customerOrder.findMany({
      where: {
        tenant_id: tenantId,
        customer_whatsapp: customerWhatsapp,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findByTenant(tenantId: string, take = 50): Promise<CustomerOrder[]> {
    return this.prisma.customerOrder.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
      take,
    });
  }

  async findByIdAndTenant(
    id: string,
    tenantId: string,
  ): Promise<(CustomerOrder & { order_details: OrderDetail[] }) | null> {
    return this.prisma.customerOrder.findFirst({
      where: { id, tenant_id: tenantId },
      include: { order_details: true },
    });
  }
}
