import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantRepository } from './tenant.repository';
import { TenantWhatsAppNumberRepository } from './tenant-whatsapp-number.repository';
import { InventoryProductRepository } from './inventory-product.repository';
import { CustomerOrderRepository } from './customer-order.repository';
import { OrderDetailRepository } from './order-detail.repository';
import { LedgerEntryRepository } from './ledger-entry.repository';
import { FinancialLedgerSummaryRepository } from './financial-ledger-summary.repository';
import { PendingSettlementRepository } from './pending-settlement.repository';
import { TransactionRunner } from './transaction-runner.service';

const repositories = [
  PrismaService,
  TransactionRunner,
  TenantRepository,
  TenantWhatsAppNumberRepository,
  InventoryProductRepository,
  CustomerOrderRepository,
  OrderDetailRepository,
  LedgerEntryRepository,
  FinancialLedgerSummaryRepository,
  PendingSettlementRepository,
];

@Global()
@Module({
  providers: repositories,
  exports: repositories,
})
export class RepositoriesModule {}
