import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FinanceQueryService } from '../services/finance-query.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request.interface';

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(private readonly financeQuery: FinanceQueryService) {}

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
}
