import { Injectable } from '@nestjs/common';
import {
  LedgerEntryType,
  PendingSettlement,
  PendingSettlementStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from './prisma.service';

export type CreatePendingSettlementData = {
  tenant_id: string;
  party_identifier: string;
  entry_type: LedgerEntryType;
  amount: Prisma.Decimal | number | string;
  requested_by: string;
  source_whatsapp_message_id: string;
  raw_message_text: string;
  expires_at?: Date;
};

@Injectable()
export class PendingSettlementRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inserts a PENDING PendingSettlement with `expires_at` (default +5 minutes).
   *
   * Unique constraint violation on `source_whatsapp_message_id` is the expected
   * idempotency guard (duplicate WhatsApp message) — not a random failure.
   * Callers must catch it and use `findBySourceMessageId` to rebuild the same
   * confirmation reply (not silent ignore).
   */
  async createPendingSettlement(
    data: CreatePendingSettlementData,
  ): Promise<PendingSettlement> {
    const expiresAt = data.expires_at ?? new Date(Date.now() + 5 * 60 * 1000);

    return this.prisma.pendingSettlement.create({
      data: {
        tenant_id: data.tenant_id,
        party_identifier: data.party_identifier,
        entry_type: data.entry_type,
        amount: data.amount,
        requested_by: data.requested_by,
        source_whatsapp_message_id: data.source_whatsapp_message_id,
        raw_message_text: data.raw_message_text,
        status: PendingSettlementStatus.PENDING,
        expires_at: expiresAt,
      },
    });
  }

  async findBySourceMessageId(
    whatsappMessageId: string,
  ): Promise<PendingSettlement | null> {
    return this.prisma.pendingSettlement.findUnique({
      where: { source_whatsapp_message_id: whatsappMessageId },
    });
  }

  async findActiveByTenantAndRequester(
    tenantId: string,
    requestedBy: string,
  ): Promise<PendingSettlement | null> {
    return this.prisma.pendingSettlement.findFirst({
      where: {
        tenant_id: tenantId,
        requested_by: requestedBy,
        status: PendingSettlementStatus.PENDING,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Finds all PENDING settlements that have passed their expiry time.
   * Used by PendingSettlementExpiryService (cron job) to bulk-expire.
   */
  async findExpiredPending(): Promise<PendingSettlement[]> {
    return this.prisma.pendingSettlement.findMany({
      where: {
        status: PendingSettlementStatus.PENDING,
        expires_at: { lt: new Date() },
      },
    });
  }

  async markConfirmed(
    id: string,
    tx: Prisma.TransactionClient,
  ): Promise<PendingSettlement> {
    return tx.pendingSettlement.update({
      where: { id },
      data: { status: PendingSettlementStatus.CONFIRMED },
    });
  }

  async markRejected(id: string): Promise<PendingSettlement> {
    return this.prisma.pendingSettlement.update({
      where: { id },
      data: { status: PendingSettlementStatus.REJECTED },
    });
  }

  async markExpired(id: string): Promise<PendingSettlement> {
    return this.prisma.pendingSettlement.update({
      where: { id },
      data: { status: PendingSettlementStatus.EXPIRED },
    });
  }
}
