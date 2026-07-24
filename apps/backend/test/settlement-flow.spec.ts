import { SettlementService } from '../src/services/settlement.service';
import { LedgerEntryType, PendingSettlementStatus, Prisma } from '@prisma/client';

function makePrismaP2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on source_whatsapp_message_id',
    { code: 'P2002', clientVersion: '5.22.0', meta: { target: ['source_whatsapp_message_id'] } },
  );
}

describe('SettlementService — Unit Tests (mocked)', () => {
  let service: SettlementService;
  let mockTx: { run: jest.Mock };
  let mockPendingRepo: {
    createPendingSettlement: jest.Mock;
    findBySourceMessageId: jest.Mock;
    findActiveByTenantAndRequester: jest.Mock;
    markConfirmed: jest.Mock;
    markRejected: jest.Mock;
    markExpired: jest.Mock;
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
  const MSG_ID = 'settle-msg-1';
  const RAW_TEXT = 'سداد 500 جنيه على 201000000002';

  beforeEach(() => {
    mockTx = { run: jest.fn() };
    mockPendingRepo = {
      createPendingSettlement: jest.fn(),
      findBySourceMessageId: jest.fn(),
      findActiveByTenantAndRequester: jest.fn(),
      markConfirmed: jest.fn(),
      markRejected: jest.fn(),
      markExpired: jest.fn(),
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

  describe('requestSettlement', () => {
    it('creates PendingSettlement with PENDING status — no immediate LedgerEntry', async () => {
      mockPendingRepo.createPendingSettlement.mockResolvedValue({
        id: 'ps-1',
        tenant_id: TENANT_ID,
        party_identifier: PARTY,
        entry_type: 'DEBIT',
        amount: 500,
        requested_by: MANAGER,
        source_whatsapp_message_id: MSG_ID,
        raw_message_text: RAW_TEXT,
        status: PendingSettlementStatus.PENDING,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
      });

      const result = await service.requestSettlement(
        TENANT_ID, PARTY, LedgerEntryType.DEBIT, 500, MANAGER, MSG_ID, RAW_TEXT,
      );

      expect(mockPendingRepo.createPendingSettlement).toHaveBeenCalled();
      expect(mockLedgerRepo.appendLedgerEntry).not.toHaveBeenCalled(); // CRITICAL: no immediate ledger write
      expect(result).toContain('تأكيد');
      expect(result).toContain('مدين'); // service uses Arabic entry type name
    });

    it('returns same confirmation text on duplicate message (idempotent)', async () => {
      mockPendingRepo.createPendingSettlement.mockRejectedValue(makePrismaP2002Error());

      mockPendingRepo.findBySourceMessageId.mockResolvedValue({
        id: 'ps-1',
        tenant_id: TENANT_ID,
        party_identifier: PARTY,
        entry_type: 'CREDIT',
        amount: 200,
        status: PendingSettlementStatus.PENDING,
      });

      const result = await service.requestSettlement(
        TENANT_ID, PARTY, LedgerEntryType.CREDIT, 200, MANAGER, MSG_ID, RAW_TEXT,
      );

      expect(result).toContain('200');
      expect(result).toContain('دائن'); // service uses Arabic entry type name
    });
  });

  describe('confirmSettlement', () => {
    it('rejects when no active pending settlement exists', async () => {
      mockPendingRepo.findActiveByTenantAndRequester.mockResolvedValue(null);

      const result = await service.confirmSettlement(TENANT_ID, MANAGER, 'تأكيد');
      expect(result).toBe('مفيش تسوية معلّقة تستنى تأكيد');
    });

    it('marks as REJECTED when manager cancels — no ledger write', async () => {
      mockPendingRepo.findActiveByTenantAndRequester.mockResolvedValue({
        id: 'ps-1',
        tenant_id: TENANT_ID,
        party_identifier: PARTY,
        entry_type: 'DEBIT',
        amount: 500,
        requested_by: MANAGER,
        source_whatsapp_message_id: MSG_ID,
        raw_message_text: RAW_TEXT,
        status: PendingSettlementStatus.PENDING,
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
      });

      const result = await service.confirmSettlement(TENANT_ID, MANAGER, 'إلغاء');
      expect(mockPendingRepo.markRejected).toHaveBeenCalledWith('ps-1');
      expect(mockLedgerRepo.appendLedgerEntry).not.toHaveBeenCalled(); // CRITICAL: no ledger write on cancel
      expect(result).toContain('إلغاء');
    });

    it('approves and creates LedgerEntry when manager confirms', async () => {
      const pending = {
        id: 'ps-1',
        tenant_id: TENANT_ID,
        party_identifier: PARTY,
        entry_type: 'DEBIT',
        amount: 500,
        requested_by: MANAGER,
        source_whatsapp_message_id: MSG_ID,
        raw_message_text: RAW_TEXT,
        status: PendingSettlementStatus.PENDING,
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
      };

      mockPendingRepo.findActiveByTenantAndRequester.mockResolvedValue(pending as any);
      
      mockTx.run.mockImplementation(async (fn: any) => fn());

      mockLedgerRepo.appendLedgerEntry.mockResolvedValue({
        id: 'le-1',
        tenant_id: TENANT_ID,
        party_identifier: PARTY,
        entry_type: 'DEBIT',
        amount: 500,
        authorized_action_by: MANAGER,
        source_whatsapp_message_id: MSG_ID,
        raw_message_text: RAW_TEXT,
      });

      mockLedgerRepo.findByTenantAndParty.mockResolvedValue([
        { entry_type: 'DEBIT', amount: 500 },
      ]);

      const result = await service.confirmSettlement(TENANT_ID, MANAGER, 'تأكيد');

      expect(mockLedgerRepo.appendLedgerEntry).toHaveBeenCalled();
      expect(mockSummaryRepo.upsertSummary).toHaveBeenCalled();
      expect(mockPendingRepo.markConfirmed).toHaveBeenCalledWith('ps-1', undefined);
      if (typeof result !== 'string') {
        expect(result.ledger_entry_id).toBe('le-1');
      }
    });
  });
});
