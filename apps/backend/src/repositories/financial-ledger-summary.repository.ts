import { Injectable } from '@nestjs/common';
import {
  FinancialLedgerSummary,
  LedgerEntryType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from './prisma.service';

export type RecalculatedSummaryFields = {
  total_debit: Prisma.Decimal | number | string;
  total_credit: Prisma.Decimal | number | string;
  running_balance: Prisma.Decimal | number | string;
  last_transaction_type?: LedgerEntryType | null;
  last_recalculated_at?: Date;
};

@Injectable()
export class FinancialLedgerSummaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenantAndParty(
    tenantId: string,
    partyIdentifier: string,
  ): Promise<FinancialLedgerSummary | null> {
    return this.prisma.financialLedgerSummary.findUnique({
      where: {
        tenant_id_party_identifier: {
          tenant_id: tenantId,
          party_identifier: partyIdentifier,
        },
      },
    });
  }

  async upsertSummary(
    tenantId: string,
    partyIdentifier: string,
    recalculatedFields: RecalculatedSummaryFields,
    tx: Prisma.TransactionClient,
  ): Promise<FinancialLedgerSummary> {
    return tx.financialLedgerSummary.upsert({
      where: {
        tenant_id_party_identifier: {
          tenant_id: tenantId,
          party_identifier: partyIdentifier,
        },
      },
      create: {
        tenant_id: tenantId,
        party_identifier: partyIdentifier,
        total_debit: recalculatedFields.total_debit,
        total_credit: recalculatedFields.total_credit,
        running_balance: recalculatedFields.running_balance,
        last_transaction_type: recalculatedFields.last_transaction_type ?? null,
        last_recalculated_at:
          recalculatedFields.last_recalculated_at ?? new Date(),
      },
      update: {
        total_debit: recalculatedFields.total_debit,
        total_credit: recalculatedFields.total_credit,
        running_balance: recalculatedFields.running_balance,
        last_transaction_type: recalculatedFields.last_transaction_type ?? null,
        last_recalculated_at:
          recalculatedFields.last_recalculated_at ?? new Date(),
      },
    });
  }

  async findByTenant(
    tenantId: string,
    partyIdentifier?: string,
  ): Promise<FinancialLedgerSummary[]> {
    return this.prisma.financialLedgerSummary.findMany({
      where: {
        tenant_id: tenantId,
        ...(partyIdentifier ? { party_identifier: partyIdentifier } : {}),
      },
    });
  }
}
