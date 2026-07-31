import { SettlementService } from '../src/services/settlement.service';
import { LedgerEntryType } from '@prisma/client';

describe('Financial Ledger Reconciliation', () => {
  let service: SettlementService;
  let mockTx: { run: jest.Mock };
  let mockPendingRepo: {
    createPendingSettlement: jest.Mock;
    findBySourceMessageId: jest.Mock;
    findActiveByTenantAndRequester: jest.Mock;
    markConfirmed: jest.Mock;
    markRejected: jest.Mock;
  };
  let mockLedgerRepo: {
    appendLedgerEntry: jest.Mock;
    findByTenantAndParty: jest.Mock;
    findBySourceMessageId: jest.Mock;
  };
  let mockSummaryRepo: {
    findByTenantAndParty: jest.Mock;
    upsertSummary: jest.Mock;
  };

  const TENANT_ID = 'tenant-1';
  const MANAGER = '201000000001';
  const PARTY = '201000000002';
  const MSG_ID = 'settle-1';
  const RAW_TEXT = 'سداد 500';

  beforeEach(() => {
    mockTx = { run: jest.fn() };
    mockPendingRepo = {
      createPendingSettlement: jest.fn(),
      findBySourceMessageId: jest.fn(),
      findActiveByTenantAndRequester: jest.fn(),
      markConfirmed: jest.fn(),
      markRejected: jest.fn(),
    };
    mockLedgerRepo = {
      appendLedgerEntry: jest.fn(),
      findByTenantAndParty: jest.fn(),
      findBySourceMessageId: jest.fn(),
    };
    mockSummaryRepo = {
      findByTenantAndParty: jest.fn(),
      upsertSummary: jest.fn(),
    };

    service = new SettlementService(
      mockTx as any,
      mockPendingRepo as any,
      mockLedgerRepo as any,
      mockSummaryRepo as any,
    );
  });

  describe('running_balance calculation from LedgerEntry source of truth', () => {
    it('DEBIT decreases balance, CREDIT increases balance', async () => {
      const pending = {
        id: 'ps-1',
        tenant_id: TENANT_ID,
        party_identifier: PARTY,
        entry_type: 'DEBIT',
        amount: 500,
        requested_by: MANAGER,
        source_whatsapp_message_id: MSG_ID,
        raw_message_text: RAW_TEXT,
        status: 'PENDING',
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
        created_at: new Date(),
      };

      mockPendingRepo.findActiveByTenantAndRequester.mockResolvedValue(pending as any);
      
      // Simulate existing entries: previous CREDIT 1000, then new DEBIT 500
      mockLedgerRepo.findByTenantAndParty.mockResolvedValue([
        { entry_type: 'CREDIT', amount: 1000 },
        { entry_type: 'DEBIT', amount: 500 }, // newly appended
      ]);

      mockTx.run.mockImplementation(async (fn: any) => fn());
      mockLedgerRepo.appendLedgerEntry.mockResolvedValue({
        ...pending, id: 'le-1',
        authorized_action_by: MANAGER,
      });

      await service.confirmSettlement(TENANT_ID, MANAGER, 'تأكيد');

      // Verify upsertSummary was called with correct calculated values
      expect(mockSummaryRepo.upsertSummary).toHaveBeenCalledWith(
        TENANT_ID,
        PARTY,
        expect.objectContaining({
          total_debit: 500,
          total_credit: 1000,
          running_balance: 500, // CREDIT 1000 - DEBIT 500 = 500 running_balance
        }),
        undefined,
      );
    });

    it('multiple DEBITs subtract sequentially', async () => {
      const pending = {
        id: 'ps-2',
        tenant_id: TENANT_ID,
        party_identifier: PARTY,
        entry_type: 'DEBIT',
        amount: 300,
        requested_by: MANAGER,
        source_whatsapp_message_id: 'msg-2',
        raw_message_text: 'سداد 300',
        status: 'PENDING',
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
        created_at: new Date(),
      };

      mockPendingRepo.findActiveByTenantAndRequester.mockResolvedValue(pending as any);
      
      mockLedgerRepo.findByTenantAndParty.mockResolvedValue([
        { entry_type: 'CREDIT', amount: 2000 },
        { entry_type: 'DEBIT', amount: 500 },
        { entry_type: 'DEBIT', amount: 300 }, // newly appended
      ]);

      mockTx.run.mockImplementation(async (fn: any) => fn());
      mockLedgerRepo.appendLedgerEntry.mockResolvedValue({
        ...pending, id: 'le-2', authorized_action_by: MANAGER,
      });

      await service.confirmSettlement(TENANT_ID, MANAGER, 'تأكيد');

      expect(mockSummaryRepo.upsertSummary).toHaveBeenCalledWith(
        TENANT_ID,
        PARTY,
        expect.objectContaining({
          total_debit: 800,
          total_credit: 2000,
          running_balance: 1200, // 2000 - 500 - 300 = 1200
        }),
        undefined,
      );
    });
  });

  describe('last_transaction_type tracking', () => {
    it('records last_transaction_type as the entry_type of the latest entry', async () => {
      const pending = {
        id: 'ps-3',
        tenant_id: TENANT_ID,
        party_identifier: PARTY,
        entry_type: 'CREDIT',
        amount: 1500,
        requested_by: MANAGER,
        source_whatsapp_message_id: 'msg-3',
        raw_message_text: 'إيداع 1500',
        status: 'PENDING',
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
        created_at: new Date(),
      };

      mockPendingRepo.findActiveByTenantAndRequester.mockResolvedValue(pending as any);
      
      mockLedgerRepo.findByTenantAndParty.mockResolvedValue([
        { entry_type: 'DEBIT', amount: 500 },
        { entry_type: 'CREDIT', amount: 1500 }, // newly appended
      ]);

      mockTx.run.mockImplementation(async (fn: any) => fn());
      mockLedgerRepo.appendLedgerEntry.mockResolvedValue({
        ...pending, id: 'le-3', authorized_action_by: MANAGER,
      });

      await service.confirmSettlement(TENANT_ID, MANAGER, 'تأكيد');

      expect(mockSummaryRepo.upsertSummary).toHaveBeenCalledWith(
        TENANT_ID,
        PARTY,
        expect.objectContaining({
          last_transaction_type: 'CREDIT',
        }),
        undefined,
      );
    });
  });
});
