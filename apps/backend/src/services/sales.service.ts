import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionRunner } from '../repositories/transaction-runner.service';
import { SaleRepository } from '../repositories/sale.repository';
import { InventoryProductRepository } from '../repositories/inventory-product.repository';
import { SettlementService } from './settlement.service';
import { SaleType } from '@prisma/client';

export type CreateSaleDTO = {
  customer_identifier: string;
  sale_type: SaleType;
  paid_amount?: number;
  items: Array<{
    product_id: string;
    quantity: number;
    selling_price?: number;
  }>;
};

@Injectable()
export class SalesService {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly saleRepository: SaleRepository,
    private readonly inventoryProductRepository: InventoryProductRepository,
    private readonly settlementService: SettlementService,
  ) {}

  async getSales(tenantId: string) {
    return this.saleRepository.findByTenantId(tenantId);
  }

  async getSaleById(tenantId: string, id: string) {
    const sale = await this.saleRepository.findById(tenantId, id);
    if (!sale) throw new NotFoundException('فاتورة المبيعات غير موجودة');
    return sale;
  }

  async createSale(tenantId: string, dto: CreateSaleDTO, userId: string) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('يجب إضافة منتج واحد على الأقل للبيع');
    }
    if (!dto.customer_identifier) {
      throw new BadRequestException('اسم أو رقم العميل مطلوب');
    }

    return this.tx.run(async (txClient) => {
      let totalAmount = 0;
      let totalProfit = 0;
      const saleItemsToCreate = [];

      for (const item of dto.items) {
        // قفل المنتج وتفقد السعر والمخزون
        const product = await this.inventoryProductRepository.lockForUpdate(item.product_id, txClient);
        if (!product || product.tenant_id !== tenantId) {
          throw new BadRequestException(`المنتج غير موجود في مخزون التينانت`);
        }

        if (product.current_stock < item.quantity) {
          throw new BadRequestException(
            `المخزون غير كافٍ للمنتج "${product.name}". المتاح: ${product.current_stock}، المطلوب: ${item.quantity}`,
          );
        }

        const sellingPrice = item.selling_price ?? Number(product.unit_price);
        const costPrice = Number(product.cost_price);
        const lineProfit = item.quantity * (sellingPrice - costPrice);
        const lineTotal = item.quantity * sellingPrice;

        totalAmount += lineTotal;
        totalProfit += lineProfit;

        saleItemsToCreate.push({
          product_id: product.id,
          quantity: item.quantity,
          selling_price: sellingPrice,
          cost_price: costPrice,
          line_profit: lineProfit,
        });

        // خصم المخزون
        await this.inventoryProductRepository.decrementStockWithLock(product.id, item.quantity, txClient);
      }

      const paidAmount = dto.sale_type === 'CASH' ? totalAmount : (dto.paid_amount ?? 0);
      const remainingAmount = totalAmount - paidAmount;
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

      // إنشاء الفاتورة
      const sale = await this.saleRepository.createSale(
        {
          tenant_id: tenantId,
          invoice_number: invoiceNumber,
          customer_identifier: dto.customer_identifier,
          sale_type: dto.sale_type,
          total_amount: totalAmount,
          paid_amount: paidAmount,
          remaining_amount: remainingAmount,
          total_profit: totalProfit,
          items: saleItemsToCreate,
        },
        txClient,
      );

      // إذا كان هناك مديونية (CREDIT أو متبقي): تسجيل قيد مدين في الـ Ledger
      if (remainingAmount > 0) {
        const msgId = `SALE-${sale.id}`;
        await this.settlementService.requestSettlement(
          tenantId,
          dto.customer_identifier,
          'DEBIT',
          remainingAmount,
          userId,
          msgId,
          `فاتورة مبيعات آجل #${invoiceNumber}`,
        );
        await this.settlementService.confirmSettlement(tenantId, userId, 'تأكيد');
      }

      return sale;
    });
  }

  async cancelSale(tenantId: string, saleId: string, userId: string) {
    const sale = await this.saleRepository.findById(tenantId, saleId);
    if (!sale) throw new NotFoundException('الفاتورة غير موجودة');
    if (sale.status === 'CANCELLED') {
      throw new BadRequestException('الفاتورة ملغاة بالفعل');
    }

    return this.tx.run(async (txClient) => {
      // إرجاع كميات المخزون
      const saleWithItems = sale as any;
      for (const item of (saleWithItems.sale_items || [])) {
        await txClient.inventoryProduct.update({
          where: { id: item.product_id },
          data: {
            current_stock: {
              increment: item.quantity,
            },
          },
        });
      }

      // إذا كان هناك مديونية على العميل، القيام بعكس القيد (DEBIT reverse => CREDIT)
      const remaining = Number(sale.remaining_amount);
      if (remaining > 0) {
        const msgId = `REVERSE-SALE-${sale.id}`;
        await this.settlementService.requestSettlement(
          tenantId,
          sale.customer_identifier,
          'CREDIT',
          remaining,
          userId,
          msgId,
          `إلغاء فاتورة مبيعات #${sale.invoice_number}`,
        );
        await this.settlementService.confirmSettlement(tenantId, userId, 'تأكيد');
      }

      // تحديث حالة الفاتورة إلى CANCELLED
      return this.saleRepository.updateStatus(sale.id, 'CANCELLED', txClient);
    });
  }

  async addPayment(tenantId: string, saleId: string, paymentAmount: number, userId: string) {
    const sale = await this.saleRepository.findById(tenantId, saleId);
    if (!sale) throw new NotFoundException('الفاتورة غير موجودة');
    if (sale.status === 'CANCELLED') {
      throw new BadRequestException('لا يمكن سداد فاتورة ملغاة');
    }

    const currentRemaining = Number(sale.remaining_amount);
    if (currentRemaining <= 0) {
      throw new BadRequestException('الفاتورة مدفوعة بالكامل');
    }

    if (paymentAmount > currentRemaining) {
      throw new BadRequestException(`المبلغ أكبر من المتبقي (${currentRemaining} ج.م)`);
    }

    const newPaid = Number(sale.paid_amount) + paymentAmount;
    const newRemaining = currentRemaining - paymentAmount;

    return this.tx.run(async (txClient) => {
      // تسجيل قيد دائن (تسديد مديونية) في الـ Ledger
      const msgId = `PAYMENT-${sale.id}-${Date.now()}`;
      await this.settlementService.requestSettlement(
        tenantId,
        sale.customer_identifier,
        'CREDIT',
        paymentAmount,
        userId,
        msgId,
        `تحصيل من فاتورة #${sale.invoice_number}`,
      );
      await this.settlementService.confirmSettlement(tenantId, userId, 'تأكيد');

      return this.saleRepository.updatePayment(sale.id, newPaid, newRemaining, txClient);
    });
  }
}
