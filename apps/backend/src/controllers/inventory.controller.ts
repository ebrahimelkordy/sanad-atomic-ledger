import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InventoryProductRepository } from '../repositories/inventory-product.repository';
import type { AuthenticatedRequest } from '../auth/authenticated-request.interface';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(
    private readonly inventoryProductRepository: InventoryProductRepository,
  ) {}

  @Get()
  async getProducts(@Req() req: AuthenticatedRequest) {
    const tenantId = req.user.tenant_id;
    return this.inventoryProductRepository.findByTenantId(tenantId);
  }

  @Post()
  async createProduct(
    @Req() req: AuthenticatedRequest,
    @Body('sku') sku: string,
    @Body('name') name: string,
    @Body('unit_price') unit_price: number,
    @Body('cost_price') cost_price: number,
    @Body('current_stock') current_stock: number,
  ) {
    const tenantId = req.user.tenant_id;
    return this.inventoryProductRepository.createProduct({
      tenant_id: tenantId,
      sku,
      name,
      unit_price: unit_price || 0,
      cost_price: cost_price || 0,
      current_stock: current_stock || 0,
    });
  }
}
