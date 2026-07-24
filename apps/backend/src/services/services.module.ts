import { Global, Module } from '@nestjs/common';
import { OrderProcessorService } from './order-processor.service';
import { SettlementService } from './settlement.service';
import { TenantOnboardingService } from './tenant-onboarding.service';
import { TenantResolutionService } from './tenant-resolution.service';
import { TenantQueryService } from './tenant-query.service';
import { OrderQueryService } from './order-query.service';
import { FinanceQueryService } from './finance-query.service';
import { PendingSettlementExpiryService } from './pending-settlement-expiry.service';
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
    AiOrchestratorModule,
  ],
})
export class ServicesModule {}
