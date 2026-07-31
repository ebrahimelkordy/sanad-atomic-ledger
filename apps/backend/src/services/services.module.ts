import { Global, Module } from '@nestjs/common';
import { OrderProcessorService } from './order-processor.service';
import { SettlementService } from './settlement.service';
import { TenantOnboardingService } from './tenant-onboarding.service';
import { TenantResolutionService } from './tenant-resolution.service';
import { TenantQueryService } from './tenant-query.service';
import { OrderQueryService } from './order-query.service';
import { FinanceQueryService } from './finance-query.service';
import { PendingSettlementExpiryService } from './pending-settlement-expiry.service';
import { SalesService } from './sales.service';
import { EmployeeService } from './employee.service';
import { CustomerService } from './customer.service';
import { ChatService } from './chat.service';
import { InventoryOperationsService } from './inventory-operations.service';
import { AiOrchestratorModule } from '../ai-orchestrator/ai-orchestrator.module';

@Global()
@Module({
  imports: [AiOrchestratorModule],
  providers: [
    OrderProcessorService,
    SettlementService,
    TenantOnboardingService,
    TenantResolutionService,
    TenantQueryService,
    OrderQueryService,
    FinanceQueryService,
    PendingSettlementExpiryService,
    SalesService,
    EmployeeService,
    CustomerService,
    InventoryOperationsService,
    ChatService,
  ],
  exports: [
    OrderProcessorService,
    SettlementService,
    TenantOnboardingService,
    TenantResolutionService,
    TenantQueryService,
    OrderQueryService,
    FinanceQueryService,
    PendingSettlementExpiryService,
    SalesService,
    EmployeeService,
    CustomerService,
    InventoryOperationsService,
    ChatService,
    AiOrchestratorModule,
  ],
})
export class ServicesModule {}
