import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { NumberRole } from '@prisma/client';
import {
  TENANT_CONTEXT_KEY,
  TenantContext,
  getTenantContextFromPayload,
} from './tenant-context';

type RequestWithTenant = {
  [TENANT_CONTEXT_KEY]?: TenantContext;
};

/**
 * Ensures settlement / finance-ledger paths only run for numbers with
 * `number_role === AUTHORIZED_FINANCE`.
 *
 * Must run AFTER `tenant.guard` (which populates the context), and BEFORE
 * any call into `SettlementService` / finance-ledger.
 *
 * - Nest HTTP: Nest Guard (`CanActivate`).
 * - BullMQ settlement path: call `assertAuthorizedFinance` with the context
 *   produced by `TenantGuard.resolveForWorker`.
 */
@Injectable()
export class FinanceRoleGuard implements CanActivate {
  private readonly logger = new Logger(FinanceRoleGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    const tenantContext = request[TENANT_CONTEXT_KEY];
    return this.assertAuthorizedFinance(tenantContext);
  }

  /**
   * Shared check for HTTP and BullMQ workers.
   * Returns `false` (and logs) when role is missing or not AUTHORIZED_FINANCE.
   */
  assertAuthorizedFinance(
    tenantContext: TenantContext | undefined | null,
  ): boolean {
    if (!tenantContext) {
      this.logger.warn(
        'finance-role.guard rejected attempt: missing tenant context (tenant.guard did not run)',
      );
      return false;
    }

    if (tenantContext.number_role !== NumberRole.AUTHORIZED_FINANCE) {
      this.logger.warn(
        `finance-role.guard rejected unauthorized finance attempt: phone=${tenantContext.phone_number} tenant_id=${tenantContext.tenant_id} number_role=${tenantContext.number_role}`,
      );
      return false;
    }

    return true;
  }

  /**
   * Convenience for BullMQ job payloads that already carry tenant context
   * via `attachTenantContext`.
   */
  assertAuthorizedFinanceFromPayload(payload: {
    [TENANT_CONTEXT_KEY]?: TenantContext;
  }): boolean {
    return this.assertAuthorizedFinance(getTenantContextFromPayload(payload));
  }
}
