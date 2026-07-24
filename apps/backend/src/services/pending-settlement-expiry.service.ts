import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PendingSettlementRepository } from '../repositories/pending-settlement.repository';

/**
 * Handles automatic expiry of PendingSettlement records.
 *
 * Per step-10 spec: "أي job دوري (cron بسيط أو فحص عند كل رسالة جديدة من
 * نفس الرقم) بينادي markExpired، ومفيش أي قيد بيتسجل."
 *
 * This cron runs every minute and marks all PENDING settlements that have
 * passed their expires_at as EXPIRED.
 *
 * Uses PendingSettlementRepository only — NO direct PrismaService access.
 */
@Injectable()
export class PendingSettlementExpiryService {
  private readonly logger = new Logger(PendingSettlementExpiryService.name);

  constructor(
    private readonly pendingSettlementRepository: PendingSettlementRepository,
  ) {}

  /**
   * Every 60 seconds, expire overdue PendingSettlements.
   * This prevents stale PENDING records from being confirmed after expiry.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireOverdueSettlements(): Promise<void> {
    try {
      const overdue =
        await this.pendingSettlementRepository.findExpiredPending();

      for (const settlement of overdue) {
        await this.pendingSettlementRepository.markExpired(settlement.id);
        this.logger.log(
          `Expired PendingSettlement ${settlement.id} for tenant=${settlement.tenant_id}`,
        );
      }

      if (overdue.length > 0) {
        this.logger.log(`Expired ${overdue.length} overdue PendingSettlements`);
      }
    } catch (err) {
      this.logger.error(
        'Failed to expire overdue PendingSettlements',
        (err as Error).stack,
      );
    }
  }
}
