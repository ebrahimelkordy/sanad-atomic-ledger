import { Injectable } from '@nestjs/common';
import {
  TenantWhatsAppNumberRepository,
  ConnectionStatus,
} from '../repositories/tenant-whatsapp-number.repository';

@Injectable()
export class SessionRepositoryAdapter {
  constructor(
    private readonly tenantWhatsAppNumberRepository: TenantWhatsAppNumberRepository,
  ) {}

  async updateConnectionStatus(
    numberId: string,
    status: ConnectionStatus,
  ): Promise<void> {
    await this.tenantWhatsAppNumberRepository.updateConnectionStatus(
      numberId,
      status,
    );
  }
}
