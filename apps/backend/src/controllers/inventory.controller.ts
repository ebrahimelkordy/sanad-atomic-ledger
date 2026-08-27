import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, RequirePermission } from '../guards/permission.guard';
import { InventoryProductRepository } from '../repositories/inventory-product.repository';
import type { AuthenticatedRequest } from '../auth/authenticated-request.interface';

@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class InventoryController {
  constructor(
    private readonly inventoryProductRepository: InventoryProductRepository,
  ) {}

  @Get()
  @RequirePermission({ resource: 'inventory', action: 'read' })
  async getProducts(@Req() req: AuthenticatedRequest) {
    const tenantId = req.principal.tenantId;
    return this.inventoryProductRepository.findByTenantId(tenantId);
  }

  @Post()
  @RequirePermission({ resource: 'inventory', action: 'create' })
  async createProduct(
    @Req() req: AuthenticatedRequest,
    @Body('sku') sku: string,
    @Body('name') name: string,
    @Body('unit_price') unit_price: number,
    @Body('cost_price') cost_price: number,
    @Body('current_stock') current_stock: number,
    @Body('low_stock_threshold') low_stock_threshold?: number,
    @Body('reorder_quantity') reorder_quantity?: number,
  ) {
    const tenantId = req.principal.tenantId;
    return this.inventoryProductRepository.createProduct({
      tenant_id: tenantId,
      sku, name,
      unit_price: unit_price || 0,
      cost_price: cost_price || 0,
      current_stock: current_stock || 0,
    } as any);
  }

  @Post(':id/price')
  @RequirePermission({ resource: 'inventory', action: 'update' })
  async updatePrice(
    @Param('id') id: string,
    @Body('new_unit_price') new_unit_price: number,
    @Body('new_cost_price') new_cost_price: number,
    @Body('change_reason') change_reason: any,
    @Body('notes') notes: string,
    @Body('effective_date') effective_date: string,
  ) {
    return this.inventoryProductRepository.updatePriceWithHistory({
      productId: id,
      newUnitPrice: new_unit_price,
      newCostPrice: new_cost_price,
      changeReason: change_reason,
      notes,
      effectiveDate: effective_date ? new Date(effective_date) : undefined,
    });
  }

  @Get(':id/price-history')
  @RequirePermission({ resource: 'report.inventory', action: 'read' })
  async getPriceHistory(@Param('id') id: string) {
    return this.inventoryProductRepository.getPriceHistory(id);
  }
}
