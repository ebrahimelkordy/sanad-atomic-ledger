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

  @Post('whatsapp-numbers/pair-code')
  async getPairCode(
    @Body('whatsapp_number') whatsapp_number: string,
  ) {
    // محاكاة أو توليد كود الاقتران
    const cleanNumber = (whatsapp_number || '').replace(/[^0-9]/g, '');
    const dummyCode = `${cleanNumber.slice(-4)}-${Math.floor(1000 + Math.random() * 9000)}`;
    return { pairing_code: dummyCode, message: 'استخدم هذا الكود في تطبيق الواتساب للربط' };
  }
}
