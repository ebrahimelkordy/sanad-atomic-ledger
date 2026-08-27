import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantQueryService } from '../services/tenant-query.service';
import { BaileysGatewayService } from '../whatsapp-gateway/baileys-gateway.service';
import { BaileysSessionManagerService } from '../whatsapp-gateway/baileys-session-manager.service';
import { TenantWhatsAppNumberRepository } from '../repositories/tenant-whatsapp-number.repository';
import type { AuthenticatedRequest } from '../auth/authenticated-request.interface';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantController {
  constructor(
    private readonly tenantQuery: TenantQueryService,
    private readonly baileysGateway: BaileysGatewayService,
    private readonly sessionManager: BaileysSessionManagerService,
    private readonly whatsappNumberRepo: TenantWhatsAppNumberRepository,
  ) {}

  @Get('me')
  async getMe(@Req() req: AuthenticatedRequest) {
    const tenantId = req.principal.tenantId;
    return this.tenantQuery.getTenant(tenantId);
  }

  @Post('whatsapp-numbers')
  async addWhatsappNumber(
    @Req() req: AuthenticatedRequest,
    @Body('whatsapp_number') whatsapp_number: string,
    @Body('number_role') number_role: string,
  ) {
    const tenantId = req.principal.tenantId;
    return this.tenantQuery.addWhatsappNumber(
      tenantId,
      whatsapp_number,
      number_role as any,
    );
  }

  @Get('whatsapp-numbers')
  async getWhatsappNumbers(@Req() req: AuthenticatedRequest) {
    const tenantId = req.principal.tenantId;
    return this.tenantQuery.getWhatsappNumbers(tenantId);
  }

  /**
   * Task 1.2.2 — Real pairing code via Baileys (NOT a dummy code).
   *
   * Flow:
   *  1. Find the TenantWhatsAppNumber record for this number
   *  2. Register a Baileys session (or retrieve existing one)
   *  3. Request the official WhatsApp pairing code from Baileys
   *  4. Return it to the caller — user enters it in WhatsApp → Settings → Linked Devices
   */
  @Post('whatsapp-numbers/pair-code')
  async getPairCode(
    @Req() req: AuthenticatedRequest,
    @Body('whatsapp_number') whatsapp_number: string,
  ) {
    if (!whatsapp_number) {
      throw new BadRequestException('whatsapp_number is required');
    }

    const tenantId = req.principal.tenantId;
    const cleanNumber = whatsapp_number.replace(/[^0-9]/g, '');

    // Lookup the registered number record for this tenant
    const numbers = await this.tenantQuery.getWhatsappNumbers(tenantId);
    const record = numbers.find(
      (n) => n.phone_number.replace(/[^0-9]/g, '') === cleanNumber,
    );

    if (!record) {
      throw new BadRequestException(
        'رقم الواتساب غير مُسجَّل لهذا الحساب. أضفه أولاً.',
      );
    }

    // Register the Baileys session (idempotent — returns existing if already open)
    await this.baileysGateway.registerNumber({
      tenantId,
      phoneNumber: record.phone_number,
      numberId: record.id,
    });

    // Request the real pairing code from WhatsApp via Baileys
    const code = await this.sessionManager.requestPairingCode(
      record.phone_number,
    );

    return {
      pairing_code: code,
      phone_number: record.phone_number,
      message:
        'افتح واتساب → الإعدادات → الأجهزة المرتبطة → ربط جهاز → أدخل الكود',
    };
  }

  /**
   * Task 1.2.3 — Session status endpoint
   * Returns connection state for all numbers registered to this tenant.
   */
  @Get('whatsapp-numbers/status')
  async getWhatsappStatus(@Req() req: AuthenticatedRequest) {
    const tenantId = req.principal.tenantId;
    const numbers = await this.whatsappNumberRepo.findAllByTenant(tenantId);

    return numbers.map((n) => ({
      id: n.id,
      phone_number: n.phone_number,
      number_role: n.number_role,
      connection_status: n.connection_status,
      session_active: !!this.sessionManager.getSessionByTenant(tenantId),
    }));
  }
}
