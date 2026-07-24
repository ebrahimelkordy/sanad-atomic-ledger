import { Injectable } from '@nestjs/common';
import { LedgerEntry, LedgerEntryType, Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type AppendLedgerEntryData = {
  tenant_id: string;
  party_identifier: string;
  entry_type: LedgerEntryType;
  amount: Prisma.Decimal | number | string;
  reference_order_id?: string | null;
  authorized_action_by?: string | null;
  source_whatsapp_message_id?: string | null;
  raw_message_text?: string | null;
};

@Injectable()
export class LedgerEntryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append-only insert. No update or delete methods exist on this repository.
   *
   * Unique constraint violation on `source_whatsapp_message_id` is the expected
   * idempotency guard (e.g. duplicate "تأكيد" confirmation message) — not a
   * random failure. Callers must catch it and use `findBySourceMessageId`.
   */
  async appendLedgerEntry(
    entryData: AppendLedgerEntryData,
    tx: Prisma.TransactionClient,
  ): Promise<LedgerEntry> {
    return tx.ledgerEntry.create({
      data: {
        tenant_id: entryData.tenant_id,
        party_identifier: entryData.party_identifier,
        entry_type: entryData.entry_type,
        amount: entryData.amount,
        reference_order_id: entryData.reference_order_id ?? null,
        authorized_action_by: entryData.authorized_action_by ?? null,
        source_whatsapp_message_id:
          entryData.source_whatsapp_message_id ?? null,
        raw_message_text: entryData.raw_message_text ?? null,
      },
    });
  }

  async findByTenantAndParty(
    tenantId: string,
    partyIdentifier: string,
    tx?: Prisma.TransactionClient,
  ): Promise<LedgerEntry[]> {
    const client = tx ?? this.prisma;
    return client.ledgerEntry.findMany({
      where: {
        tenant_id: tenantId,
        party_identifier: partyIdentifier,
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async findBySourceMessageId(
    whatsappMessageId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<LedgerEntry | null> {
    const client = tx ?? this.prisma;
    return client.ledgerEntry.findUnique({
      where: { source_whatsapp_message_id: whatsappMessageId },
    });
  }

  async findByTenant(
    tenantId: string,
    partyIdentifier?: string,
    take = 50,
  ): Promise<LedgerEntry[]> {
    return this.prisma.ledgerEntry.findMany({
      where: {
        tenant_id: tenantId,
        ...(partyIdentifier ? { party_identifier: partyIdentifier } : {}),
      },
      orderBy: { created_at: 'desc' },
      take,
    });
  }
}
