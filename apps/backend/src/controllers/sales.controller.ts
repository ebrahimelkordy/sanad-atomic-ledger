import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, RequirePermission } from '../guards/permission.guard';
import { SalesService } from '../services/sales.service';
import type { CreateSaleDTO } from '../services/sales.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request.interface';

@Controller('sales')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @RequirePermission({ resource: 'sale', action: 'read' })
  async getSales(@Req() req: AuthenticatedRequest) {
    const tenantId = req.principal.tenantId;
    return this.salesService.getSales(tenantId);
  }

  @Get(':id')
  @RequirePermission({ resource: 'sale', action: 'read' })
  async getSaleById(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal.tenantId;
    return this.salesService.getSaleById(tenantId, id);
  }

  @Post()
  @RequirePermission({ resource: 'sale', action: 'create' })
  async createSale(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSaleDTO,
  ) {
    const tenantId = req.principal.tenantId;
    const userId = req.principal.userId;
    return this.salesService.createSale(tenantId, dto, userId);
  }

  @Post(':id/cancel')
  @RequirePermission({ resource: 'sale', action: 'delete' })
  async cancelSale(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal.tenantId;
    const userId = req.principal.userId;
    return this.salesService.cancelSale(tenantId, id, userId);
  }

  @Post(':id/payments')
  @RequirePermission({ resource: 'sale.payment', action: 'create' })
  async addPayment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body('amount') amount: number,
  ) {
    const tenantId = req.principal.tenantId;
    const userId = req.principal.userId;
    return this.salesService.addPayment(tenantId, id, amount, userId);
  }

  @Get(':id/invoice-html')
  @RequirePermission({ resource: 'sale', action: 'read' })
  async getInvoiceHtml(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal.tenantId;
    const sale = await this.salesService.getSaleById(tenantId, id);
    const saleData = sale as any;
    const itemsHtml = (saleData.items || saleData.sale_items || [])
      .map(
        (item: any) => `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.product?.name || item.product_id}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${item.selling_price} ج.م</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${Number(item.selling_price) * item.quantity} ج.م</td>
        </tr>`,
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>فاتورة مبيعات #${sale.invoice_number}</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 20px; color: #333; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background: #f4f4f4; padding: 8px; border: 1px solid #ddd; text-align: right; }
          .total { font-weight: bold; font-size: 1.2em; text-align: left; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>فاتورة مبيعات</h2>
          <p>رقم الفاتورة: <strong>#${sale.invoice_number}</strong> | التاريخ: ${new Date(sale.invoice_date).toLocaleDateString('ar-EG')}</p>
          <p>العميل: <strong>${sale.customer_identifier}</strong></p>
        </div>
        <table>
          <thead>
            <tr>
              <th>الصنف</th>
              <th style="text-align: center;">الكمية</th>
              <th style="text-align: right;">سعر الوحدة</th>
              <th style="text-align: right;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div class="total">
          <p>الإجمالي الكلي: <strong>${sale.total_amount} ج.م</strong></p>
          <p>المبلغ المدفوع: ${sale.paid_amount} ج.م | المتبقي: ${sale.remaining_amount} ج.م</p>
        </div>
      </body>
      </html>
    `;
  }
}

