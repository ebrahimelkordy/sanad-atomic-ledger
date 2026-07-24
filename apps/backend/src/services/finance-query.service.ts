import { Injectable } from '@nestjs/common';
import { LedgerEntryRepository } from '../repositories/ledger-entry.repository';
import { FinancialLedgerSummaryRepository } from '../repositories/financial-ledger-summary.repository';

@Injectable()
export class FinanceQueryService {
  constructor(
    private readonly ledgerRepo: LedgerEntryRepository,
    private readonly summaryRepo: FinancialLedgerSummaryRepository,
  ) {}

  async getLedger(tenantId: string, partyIdentifier?: string) {
    return this.ledgerRepo.findByTenant(tenantId, partyIdentifier);
  }

  async getSummary(tenantId: string, partyIdentifier?: string) {
    return this.summaryRepo.findByTenant(tenantId, partyIdentifier);
  }
}
