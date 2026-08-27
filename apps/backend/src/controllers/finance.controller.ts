import { Controller, Get, Post, Body, Query, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, RequirePermission } from '../guards/permission.guard';
import { FinanceQueryService } from '../services/finance-query.service';
import { SettlementService } from '../services/settlement.service';
import { TenantRepository } from '../repositories/tenant.repository';
import type { AuthenticatedRequest } from '../auth/authenticated-request.interface';

import { FinancialReportsService } from '../services/financial-reports.service';

@Controller('finance')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class FinanceController {
  constructor(
    private readonly financeQuery: FinanceQueryService,
    private readonly settlementService: SettlementService,
    private readonly tenantRepo: TenantRepository,
    private readonly reportsService: FinancialReportsService,
  ) {}

  @Get('ledger')
  @RequirePermission({ resource: 'finance.ledger', action: 'read' })
  async getLedger(
    @Req() req: AuthenticatedRequest,
    @Query('party_identifier') partyIdentifier?: string,
  ) {
    const tenantId = req.principal.tenantId;
    return this.financeQuery.getLedger(tenantId, partyIdentifier);
  }

  @Get('summary')
  @RequirePermission({ resource: 'finance.ledger', action: 'read' })
  async getSummary(
    @Req() req: AuthenticatedRequest,
    @Query('party_identifier') partyIdentifier?: string,
  ) {
    const tenantId = req.principal.tenantId;
    return this.financeQuery.getSummary(tenantId, partyIdentifier);
  }

  @Post('manual-entry')
  @RequirePermission({ resource: 'finance.ledger', action: 'write' })
  async createManualEntry(
    @Req() req: AuthenticatedRequest,
    @Body('party_identifier') party_identifier: string,
    @Body('entry_type') entry_type: 'DEBIT' | 'CREDIT',
    @Body('amount') amount: number,
  ) {
    const tenantId = req.principal.tenantId;
    const requestedBy = req.principal.userId;
    const msgId = `MANUAL-${Date.now()}`;

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

  @Post('settlement/confirm')
  @RequirePermission({ resource: 'finance.settlement', action: 'approve' })
  async confirmSettlement(@Req() req: AuthenticatedRequest, @Body('keyword') keyword: string) {
    return this.settlementService.confirmSettlement(req.principal.tenantId, req.principal.userId, keyword);
  }

  @Post('period/close')
  @RequirePermission({ resource: 'finance.period', action: 'close' })
  async closeFinancialPeriod(@Req() req: AuthenticatedRequest, @Body('until') untilISO: string) {
    const d = new Date(untilISO);
    if (isNaN(d.getTime())) {
      throw new BadRequestException('Invalid until date');
    }
    const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    await this.tenantRepo.closeFinancialPeriod(req.principal.tenantId, endOfDay);
    return { closed_until: endOfDay.toISOString(), ok: true };
  }

  @Get('reports/p-and-l')
  @RequirePermission({ resource: 'report.financial', action: 'read' })
  async getProfitAndLoss(
    @Req() req: AuthenticatedRequest,
    @Query('from') fromISO?: string,
    @Query('to') toISO?: string,
  ) {
    const tenantId = req.principal.tenantId;
    return this.reportsService.getProfitAndLoss(tenantId, fromISO, toISO);
  }

  @Get('statement/:partyIdentifier')
  @RequirePermission({ resource: 'finance.ledger', action: 'read' })
  async getStatementOfAccount(
    @Req() req: AuthenticatedRequest,
    @Query('partyIdentifier') partyIdentifier: string,
    @Query('from') fromISO?: string,
    @Query('to') toISO?: string,
  ) {
    const tenantId = req.principal.tenantId;
    return this.reportsService.getStatementOfAccount(tenantId, partyIdentifier, fromISO, toISO);
  }
}
