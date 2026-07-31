import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FinanceQueryService } from '../services/finance-query.service';
import { SettlementService } from '../services/settlement.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request.interface';

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(
    private readonly financeQuery: FinanceQueryService,
    private readonly settlementService: SettlementService,
  ) {}

  @Get('ledger')
  async getLedger(
    @Req() req: AuthenticatedRequest,
    @Query('party_identifier') partyIdentifier?: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.financeQuery.getLedger(tenantId, partyIdentifier);
  }

  @Get('summary')
  async getSummary(
    @Req() req: AuthenticatedRequest,
    @Query('party_identifier') partyIdentifier?: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.financeQuery.getSummary(tenantId, partyIdentifier);
  }

  @Post('manual-entry')
  async createManualEntry(
    @Req() req: AuthenticatedRequest,
    @Body('party_identifier') party_identifier: string,
    @Body('entry_type') entry_type: 'DEBIT' | 'CREDIT',
    @Body('amount') amount: number,
  ) {
    const tenantId = req.user.tenant_id;
    const requestedBy = req.user.tenant_id || 'SYSTEM_ADMIN';
    const msgId = `MANUAL-${Date.now()}`;
    
    // تسجيل تسوية مباشرة وتأكيدها
    await this.settlementService.requestSettlement(
      tenantId,
      party_identifier,
      entry_type,
      amount,
      requestedBy,
      msgId,
      `Manual entry: ${entry_type} ${amount}`,
    );

    return this.settlementService.confirmSettlement(tenantId, requestedBy, 'تأكيد');
  }
}
