import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SalesService } from '../services/sales.service';
import type { CreateSaleDTO } from '../services/sales.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request.interface';

@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  async getSales(@Req() req: AuthenticatedRequest) {
    const tenantId = req.user.tenant_id;
    return this.salesService.getSales(tenantId);
  }

  @Get(':id')
  async getSaleById(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.salesService.getSaleById(tenantId, id);
  }

  @Post()
  async createSale(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSaleDTO,
  ) {
    const tenantId = req.user.tenant_id;
    const userId = req.user.user_id || 'ADMIN';
    return this.salesService.createSale(tenantId, dto, userId);
  }

  @Post(':id/cancel')
  async cancelSale(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.user.tenant_id;
    const userId = req.user.user_id || 'ADMIN';
    return this.salesService.cancelSale(tenantId, id, userId);
  }

  @Post(':id/payments')
  async addPayment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body('amount') amount: number,
  ) {
    const tenantId = req.user.tenant_id;
    const userId = req.user.user_id || 'ADMIN';
    return this.salesService.addPayment(tenantId, id, amount, userId);
  }
}
