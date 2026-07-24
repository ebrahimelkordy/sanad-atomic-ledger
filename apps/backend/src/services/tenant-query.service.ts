import { Injectable } from '@nestjs/common';
import { TenantRepository } from '../repositories/tenant.repository';
import { TenantWhatsAppNumberRepository } from '../repositories/tenant-whatsapp-number.repository';
import { NumberRole } from '@prisma/client';

@Injectable()
export class TenantQueryService {
  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly whatsappNumberRepo: TenantWhatsAppNumberRepository,
  ) {}

  async getTenant(tenantId: string) {
    return this.tenantRepo.findById(tenantId);
  }

  async addWhatsappNumber(
    tenantId: string,
    whatsappNumber: string,
    role: NumberRole,
  ) {
    return this.whatsappNumberRepo.registerNumber(
      tenantId,
      whatsappNumber,
      role,
    );
  }

  async getWhatsappNumbers(tenantId: string) {
    return this.whatsappNumberRepo.findAllByTenant(tenantId);
  }
}
