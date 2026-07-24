import { OrderProcessorService, ExtractedOrderItem } from '../src/services/order-processor.service';
import { InsufficientStockException } from '../src/services/insufficient-stock.exception';
import { OrderStatus, Prisma } from '@prisma/client';

function makePrismaP2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on source_whatsapp_message_id',
    { code: 'P2002', clientVersion: '5.22.0', meta: { target: ['source_whatsapp_message_id'] } },
  );
}

describe('OrderProcessorService — Unit Tests (mocked)', () => {
  let service: OrderProcessorService;
  let mockTx: { run: jest.Mock };
  let mockInventoryRepo: {
    findByTenantAndSku: jest.Mock;
    findByTenantAndName: jest.Mock;
    lockForUpdate: jest.Mock;
    decrementStockWithLock: jest.Mock;
  };
  let mockOrderRepo: {
    createOrderWithDetails: jest.Mock;
    createRejectedOrder: jest.Mock;
    findBySourceMessageId: jest.Mock;
    findByTenantAndCustomer: jest.Mock;
  };
  let mockLedgerRepo: {
    appendLedgerEntry: jest.Mock;
    findBySourceMessageId: jest.Mock;
  };

  const TENANT_ID = 'tenant-1';
  const CUSTOMER = '201001234567';
  const MSG_ID = 'msg-123';
  const RAW_TEXT = 'طلب 2 بيبسي';

  beforeEach(() => {
    mockTx = { run: jest.fn() };
    mockInventoryRepo = {
      findByTenantAndSku: jest.fn(),
      findByTenantAndName: jest.fn(),
      lockForUpdate: jest.fn(),
      decrementStockWithLock: jest.fn(),
    };
    mockOrderRepo = {
      createOrderWithDetails: jest.fn(),
      createRejectedOrder: jest.fn(),
      findBySourceMessageId: jest.fn(),
      findByTenantAndCustomer: jest.fn(),
    };
    mockLedgerRepo = {
      appendLedgerEntry: jest.fn(),
      findBySourceMessageId: jest.fn(),
    };

    service = new OrderProcessorService(
      mockTx as any,
      mockInventoryRepo as any,
      mockOrderRepo as any,
      mockLedgerRepo as any,
    );
  });

  describe('processOrder', () => {
    it('returns rejection for unknown product', async () => {
      mockInventoryRepo.findByTenantAndSku.mockResolvedValue(null);
      mockInventoryRepo.findByTenantAndName.mockResolvedValue([]);

      const items: ExtractedOrderItem[] = [{ productNameOrSku: 'UNKNOWN', quantity: 1 }];
      const result = await service.processOrder(TENANT_ID, CUSTOMER, items, MSG_ID, RAW_TEXT);

      expect(result.order_status).toBe('REJECTED_INSUFFICIENT_STOCK');
      expect('rejection_text' in result).toBe(true);
      if ('rejection_text' in result) {
        expect(result.rejection_text).toContain('منتج غير معروف');
      }
    });

    it('returns rejection for ambiguous product (multiple name matches)', async () => {
      mockInventoryRepo.findByTenantAndSku.mockResolvedValue(null);
      mockInventoryRepo.findByTenantAndName.mockResolvedValue([
        { id: 'p1', name: 'بيبسي', sku: 'PEPSI', current_stock: 10, unit_price: 10, tenant_id: TENANT_ID, vertical_metadata: {} } as any,
        { id: 'p2', name: 'بيبسي دايت', sku: 'PEPSI-DIET', current_stock: 5, unit_price: 12, tenant_id: TENANT_ID, vertical_metadata: {} } as any,
      ]);

      const items: ExtractedOrderItem[] = [{ productNameOrSku: 'بيبسي', quantity: 1 }];
      const result = await service.processOrder(TENANT_ID, CUSTOMER, items, MSG_ID, RAW_TEXT);

      expect(result.order_status).toBe('REJECTED_INSUFFICIENT_STOCK');
      expect('rejection_text' in result).toBe(true);
      if ('rejection_text' in result) {
        expect(result.rejection_text).toContain('تقصد');
      }
    });

    it('rejects quantity <= 0', async () => {
      const items: ExtractedOrderItem[] = [{ productNameOrSku: 'بيبسي', quantity: 0 }];

      const result = await service.processOrder(TENANT_ID, CUSTOMER, items, MSG_ID, RAW_TEXT);
      expect(result.order_status).toBe('REJECTED_INSUFFICIENT_STOCK');
      if ('rejection_text' in result) {
        expect(result.rejection_text).toContain('أكبر من صفر');
      }
    });

    it('returns rejection for insufficient stock', async () => {
      mockInventoryRepo.findByTenantAndSku.mockResolvedValue({
        id: 'p1', name: 'بيبسي', sku: 'PEPSI', current_stock: 0, unit_price: 10,
        tenant_id: TENANT_ID, vertical_metadata: {},
      } as any);
      
      mockTx.run.mockRejectedValue(new InsufficientStockException());

      mockOrderRepo.createRejectedOrder.mockResolvedValue({
        id: 'rej-1', order_status: OrderStatus.REJECTED_INSUFFICIENT_STOCK, grand_total: 0,
        tenant_id: TENANT_ID, customer_whatsapp: CUSTOMER,
        source_whatsapp_message_id: MSG_ID, raw_message_text: RAW_TEXT,
        created_at: new Date(),
      } as any);

      const items: ExtractedOrderItem[] = [{ productNameOrSku: 'PEPSI', quantity: 1 }];
      const result = await service.processOrder(TENANT_ID, CUSTOMER, items, MSG_ID, RAW_TEXT);

      expect(result.order_status).toBe(OrderStatus.REJECTED_INSUFFICIENT_STOCK);
      expect(mockOrderRepo.createRejectedOrder).toHaveBeenCalled();
    });

    it('handles idempotent duplicate (same whatsappMessageId)', async () => {
      mockInventoryRepo.findByTenantAndSku.mockResolvedValue({
        id: 'p1', name: 'بيبسي', sku: 'PEPSI', current_stock: 10, unit_price: 10,
        tenant_id: TENANT_ID, vertical_metadata: {},
      } as any);

      const existingOrder = {
        id: 'ord-1', order_status: OrderStatus.CONFIRMED, grand_total: 20,
        tenant_id: TENANT_ID, customer_whatsapp: CUSTOMER,
        source_whatsapp_message_id: MSG_ID, raw_message_text: RAW_TEXT,
        created_at: new Date(),
        order_details: [
          { product_id: 'p1', quantity_ordered: 2, unit_price_at_order: 10 },
        ],
      };

      mockTx.run.mockRejectedValue(makePrismaP2002Error());
      mockOrderRepo.findBySourceMessageId.mockResolvedValue(existingOrder as any);

      const items: ExtractedOrderItem[] = [{ productNameOrSku: 'PEPSI', quantity: 2 }];
      const result = await service.processOrder(TENANT_ID, CUSTOMER, items, MSG_ID, RAW_TEXT);

      expect(result.order_status).toBe(OrderStatus.CONFIRMED);
      expect('invoice_text' in result).toBe(true);
    });
  });
});
