import { NumberRole, OrderStatus } from '@prisma/client';
import { LedgerEntryRepository } from './ledger-entry.repository';
import { PendingSettlementRepository } from './pending-settlement.repository';
import { CustomerOrderRepository } from './customer-order.repository';
import { OrderDetailRepository } from './order-detail.repository';

describe('Phase 03 repository contracts', () => {
  it('LedgerEntryRepository exposes append/find only (no update/delete)', () => {
    const proto = LedgerEntryRepository.prototype;
    expect(typeof proto.appendLedgerEntry).toBe('function');
    expect(typeof proto.findByTenantAndParty).toBe('function');
    expect(typeof proto.findBySourceMessageId).toBe('function');
    expect(
      (proto as { updateLedgerEntry?: unknown }).updateLedgerEntry,
    ).toBeUndefined();
    expect(
      (proto as { deleteLedgerEntry?: unknown }).deleteLedgerEntry,
    ).toBeUndefined();
  });

  it('PendingSettlementRepository has no delete method', () => {
    const proto = PendingSettlementRepository.prototype;
    expect(typeof proto.createPendingSettlement).toBe('function');
    expect(typeof proto.findBySourceMessageId).toBe('function');
    expect(typeof proto.findActiveByTenantAndRequester).toBe('function');
    expect(typeof proto.markConfirmed).toBe('function');
    expect(typeof proto.markRejected).toBe('function');
    expect(typeof proto.markExpired).toBe('function');
    expect((proto as { delete?: unknown }).delete).toBeUndefined();
    expect(
      (proto as { deletePendingSettlement?: unknown }).deletePendingSettlement,
    ).toBeUndefined();
  });

  it('OrderDetailRepository has findByOrderId only', () => {
    const proto = OrderDetailRepository.prototype;
    expect(typeof proto.findByOrderId).toBe('function');
    expect((proto as { create?: unknown }).create).toBeUndefined();
    expect(
      (proto as { createOrderDetail?: unknown }).createOrderDetail,
    ).toBeUndefined();
  });

  it('CustomerOrderRepository uses required order statuses', () => {
    expect(OrderStatus.CONFIRMED).toBe('CONFIRMED');
    expect(OrderStatus.REJECTED_INSUFFICIENT_STOCK).toBe(
      'REJECTED_INSUFFICIENT_STOCK',
    );
    expect(NumberRole.AUTHORIZED_FINANCE).toBe('AUTHORIZED_FINANCE');
    const proto = CustomerOrderRepository.prototype;
    expect(typeof proto.createOrderWithDetails).toBe('function');
    expect(typeof proto.createRejectedOrder).toBe('function');
    expect(typeof proto.findBySourceMessageId).toBe('function');
    expect(typeof proto.findByTenantAndCustomer).toBe('function');
  });
});
