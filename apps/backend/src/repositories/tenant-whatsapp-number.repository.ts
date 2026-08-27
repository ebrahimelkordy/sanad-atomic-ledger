import { Injectable } from '@nestjs/common';
import { NumberRole, Tenant, TenantWhatsAppNumber } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'PENDING_QR_SCAN';

@Injectable()
export class TenantWhatsAppNumberRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByPhoneNumber(
    phoneNumber: string,
  ): Promise<(TenantWhatsAppNumber & { tenant: Tenant }) | null> {
    return this.prisma.tenantWhatsAppNumber.findUnique({
      where: { phone_number: phoneNumber },
      include: { tenant: true },
    });
  }

  async registerNumber(
    tenantId: string,
    phoneNumber: string,
    numberRole: NumberRole,
  ): Promise<TenantWhatsAppNumber> {
    return this.prisma.tenantWhatsAppNumber.create({
      data: {
        tenant_id: tenantId,
        phone_number: phoneNumber,
        number_role: numberRole,
      },
    });
  }

  async updateConnectionStatus(
    numberId: string,
    status: ConnectionStatus,
  ): Promise<TenantWhatsAppNumber> {
    return this.prisma.tenantWhatsAppNumber.update({
      where: { id: numberId },
      data: { connection_status: status },
    });
  }

  async findAllByTenant(tenantId: string): Promise<TenantWhatsAppNumber[]> {
    return this.prisma.tenantWhatsAppNumber.findMany({
      where: { tenant_id: tenantId },
    });
  }

  /**
   * Returns all registered WhatsApp numbers across all tenants.
   * Used by WhatsappBootstrapService on application startup to restore
   * active Baileys sessions. Includes numbers that were previously
   * connected or pending, so they can be re-registered on restart.
   */
  async findAllConnectable(): Promise<TenantWhatsAppNumber[]> {
    return this.prisma.tenantWhatsAppNumber.findMany({
      where: {
        connection_status: { not: 'DISCONNECTED' },
      },
      orderBy: { tenant_id: 'asc' },
    });
  }
}
