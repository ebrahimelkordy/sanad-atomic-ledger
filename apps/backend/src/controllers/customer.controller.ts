import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CustomerService } from '../services/customer.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request.interface';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  async getCustomers(@Req() req: AuthenticatedRequest) {
    const tenantId = req.user.tenant_id;
    return this.customerService.getCustomers(tenantId);
  }

  @Get(':id')
  async getCustomerById(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tenantId = req.user.tenant_id;
    return this.customerService.getCustomerById(tenantId, id);
  }

  @Post()
  async createCustomer(
    @Req() req: AuthenticatedRequest,
    @Body('name') name: string,
    @Body('phone') phone: string,
    @Body('whatsapp') whatsapp: string,
    @Body('location_address') location_address: string,
    @Body('notes') notes: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.customerService.createCustomer(tenantId, {
      name,
      phone,
      whatsapp,
      location_address,
      notes,
    });
  }
}
