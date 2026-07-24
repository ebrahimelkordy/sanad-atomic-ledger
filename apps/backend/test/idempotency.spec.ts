import { OrderStatus } from '@prisma/client';
import { isSourceWhatsappMessageIdConflict } from '../src/services/idempotency.util';
import { Prisma } from '@prisma/client';

describe('Idempotency & Audit Trail', () => {
  describe('isSourceWhatsappMessageIdConflict', () => {
    it('returns true for P2002 on source_whatsapp_message_id (string target)', () => {
      const err = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.22.0' },
      );
      (err.meta as any) = { target: 'source_whatsapp_message_id' };

      expect(isSourceWhatsappMessageIdConflict(err)).toBe(true);
    });

    it('returns true for P2002 on source_whatsapp_message_id (array target)', () => {
      const err = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.22.0' },
      );
      (err.meta as any) = { target: ['source_whatsapp_message_id', 'tenant_id'] };

      expect(isSourceWhatsappMessageIdConflict(err)).toBe(true);
    });

    it('returns false for non-P2002 errors', () => {
      const err = new Prisma.PrismaClientKnownRequestError(
        'Foreign key failed',
        { code: 'P2003', clientVersion: '5.22.0' },
      );
      (err.meta as any) = { target: 'source_whatsapp_message_id' };

      expect(isSourceWhatsappMessageIdConflict(err)).toBe(false);
    });

    it('returns false for P2002 on a different field', () => {
      const err = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.22.0' },
      );
      (err.meta as any) = { target: 'phone_number' };

      expect(isSourceWhatsappMessageIdConflict(err)).toBe(false);
    });
  });

  describe('OrderStatus values', () => {
    it('CONFIRMED and REJECTED_INSUFFICIENT_STOCK exist', () => {
      expect(OrderStatus.CONFIRMED).toBe('CONFIRMED');
      expect(OrderStatus.REJECTED_INSUFFICIENT_STOCK).toBe('REJECTED_INSUFFICIENT_STOCK');
    });
  });
});
