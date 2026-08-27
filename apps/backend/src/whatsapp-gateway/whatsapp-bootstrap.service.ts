import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { TenantWhatsAppNumberRepository } from '../repositories/tenant-whatsapp-number.repository';
import { BaileysGatewayService } from './baileys-gateway.service';

/**
 * Sprint 1A — Task 1.1.2
 *
 * Runs ONCE after the NestJS DI container is fully initialized.
 * Loads every WhatsApp number that was previously CONNECTED or PENDING_QR_SCAN
 * and re-registers its Baileys session so the gateway starts listening
 * immediately without any manual intervention.
 *
 * Without this service, Baileys sessions are never started on app restart
 * and no incoming WhatsApp messages are processed.
 */
@Injectable()
export class WhatsappBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WhatsappBootstrapService.name);

  constructor(
    private readonly tenantWhatsAppNumberRepo: TenantWhatsAppNumberRepository,
    private readonly baileysGateway: BaileysGatewayService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('🚀 WhatsApp Bootstrap: loading registered numbers...');

    let numbers: Awaited<ReturnType<TenantWhatsAppNumberRepository['findAllConnectable']>>;
    try {
      numbers = await this.tenantWhatsAppNumberRepo.findAllConnectable();
    } catch (err) {
      this.logger.error(
        'WhatsApp Bootstrap failed to query DB — skipping session restore',
        (err as Error).stack,
      );
      return;
    }

    if (numbers.length === 0) {
      this.logger.log('WhatsApp Bootstrap: no connectable numbers found. Gateway idle.');
      return;
    }

    this.logger.log(
      `WhatsApp Bootstrap: restoring ${numbers.length} session(s)...`,
    );

    // Register sessions in parallel, but cap concurrency to avoid hammering WA
    const CONCURRENCY = 3;
    for (let i = 0; i < numbers.length; i += CONCURRENCY) {
      const batch = numbers.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (number) => {
          try {
            await this.baileysGateway.registerNumber({
              tenantId: number.tenant_id,
              phoneNumber: number.phone_number,
              numberId: number.id,
            });
            this.logger.log(
              `✅ Session restored for +${number.phone_number} (tenant: ${number.tenant_id})`,
            );
          } catch (err) {
            this.logger.error(
              `❌ Failed to restore session for +${number.phone_number}: ${(err as Error).message}`,
            );
            // Mark as DISCONNECTED so next bootstrap skips it until manually re-paired
            await this.tenantWhatsAppNumberRepo
              .updateConnectionStatus(number.id, 'DISCONNECTED')
              .catch(() => {/* best-effort */});
          }
        }),
      );
    }

    this.logger.log('✅ WhatsApp Bootstrap complete.');
  }
}
