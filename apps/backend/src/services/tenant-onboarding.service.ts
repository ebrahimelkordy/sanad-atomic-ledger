import { Injectable } from '@nestjs/common';
import { Tenant, VerticalType, NumberRole } from '@prisma/client';
import { TenantRepository } from '../repositories/tenant.repository';
import { TenantWhatsAppNumberRepository } from '../repositories/tenant-whatsapp-number.repository';
import * as bcrypt from 'bcrypt';

import { ChartOfAccountSeedService } from '../domain/coa/chart-of-account-seed.service';

@Injectable()
export class TenantOnboardingService {
  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly tenantWhatsAppNumberRepository: TenantWhatsAppNumberRepository,
    private readonly coaSeedService: ChartOfAccountSeedService,
  ) {}

  async onboardTenant(
    businessName: string,
    verticalType: VerticalType,
    firstPhoneNumber: string,
    numberRole: NumberRole,
    password?: string,
  ): Promise<Tenant> {
    let passwordHash = '';
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const tenant = await this.tenantRepository.createTenant({
      business_name: businessName,
      vertical_type: verticalType,
      password_hash: passwordHash,
    });

    await this.tenantWhatsAppNumberRepository.registerNumber(
      tenant.id,
      firstPhoneNumber,
      numberRole,
    );

    // Seed default double-entry Chart of Accounts for new tenant
    await this.coaSeedService.seedDefaultAccounts(tenant.id).catch(() => {/* best-effort */});

    return tenant;
  }
}
