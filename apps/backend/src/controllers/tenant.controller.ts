import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantQueryService } from '../services/tenant-query.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request.interface';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantController {
  constructor(private readonly tenantQuery: TenantQueryService) {}

  @Get('me')
  async getMe(@Req() req: AuthenticatedRequest) {
    const tenantId = req.user.tenant_id;
    return this.tenantQuery.getTenant(tenantId);
  }

  @Post('whatsapp-numbers')
  async addWhatsappNumber(
    @Req() req: AuthenticatedRequest,
    @Body('whatsapp_number') whatsapp_number: string,
    @Body('number_role') number_role: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.tenantQuery.addWhatsappNumber(
      tenantId,
      whatsapp_number,
      number_role as any,
    );
  }

  @Get('whatsapp-numbers')
  async getWhatsappNumbers(@Req() req: AuthenticatedRequest) {
    const tenantId = req.user.tenant_id;
    return this.tenantQuery.getWhatsappNumbers(tenantId);
  }
}
