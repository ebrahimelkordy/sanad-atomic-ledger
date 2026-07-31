import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Sale, SaleStatus, SaleType } from '@prisma/client';

export type CreateSaleInput = {
  tenant_id: string;
  invoice_number: string;
  customer_identifier: string;
  sale_type: SaleType;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  total_profit: number;
  items: Array<{
    product_id: string;
    quantity: number;
    selling_price: number;
    cost_price: number;
    line_profit: number;
  }>;
};

@Injectable()
export class SaleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenantId(tenantId: string): Promise<Sale[]> {
    return this.prisma.sale.findMany({
      where: { tenant_id: tenantId },
      include: {
        sale_items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findById(tenantId: string, id: string): Promise<Sale | null> {
    return this.prisma.sale.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        sale_items: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  async createSale(data: CreateSaleInput, tx?: any): Promise<Sale> {
    const client = tx || this.prisma;
    return client.sale.create({
      data: {
        tenant_id: data.tenant_id,
        invoice_number: data.invoice_number,
        customer_identifier: data.customer_identifier,
        sale_type: data.sale_type,
        status: 'CONFIRMED',
        total_amount: data.total_amount,
        paid_amount: data.paid_amount,
        remaining_amount: data.remaining_amount,
        total_profit: data.total_profit,
        sale_items: {
          create: data.items.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            selling_price: item.selling_price,
            cost_price: item.cost_price,
            line_profit: item.line_profit,
          })),
        },
      },
      include: {
        sale_items: true,
      },
    });
  }

  async updateStatus(id: string, status: SaleStatus, tx?: any): Promise<any> {
    const client = tx || this.prisma;
    return client.sale.update({
      where: { id },
      data: { status },
      include: {
        sale_items: true,
      },
    });
  }

  async updatePayment(id: string, paid_amount: number, remaining_amount: number, tx?: any): Promise<Sale> {
    const client = tx || this.prisma;
    return client.sale.update({
      where: { id },
      data: {
        paid_amount,
        remaining_amount,
      },
    });
  }
}
