import { Injectable } from '@nestjs/common';
import { NumberRole } from '@prisma/client';
import { TenantWhatsAppNumberRepository } from '../repositories/tenant-whatsapp-number.repository';
import { UnregisteredNumberException } from './unregistered-number.exception';

export type ResolvedTenant = {
  tenant_id: string;
  number_role: NumberRole;
};

/**
 * Resolves a registered tenant WhatsApp number to `{ tenant_id, number_role }`.
 * Used by `tenant.guard` (step 04). Full service-layer work lands in step 05;
 * this method is required now because the guard depends on it.
 */
@Injectable()
export class TenantResolutionService {
  constructor(
    private readonly tenantWhatsAppNumberRepository: TenantWhatsAppNumberRepository,
  ) {}

  async resolveTenantFromPhoneNumber(
    phoneNumber: string,
  ): Promise<ResolvedTenant> {
    const record =
      await this.tenantWhatsAppNumberRepository.findByPhoneNumber(phoneNumber);

    if (!record) {
      throw new UnregisteredNumberException(phoneNumber);
    }

    return {
      tenant_id: record.tenant_id,
      number_role: record.number_role,
    };
  }
}
