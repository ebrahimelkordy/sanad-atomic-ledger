import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { TenantResolutionService } from '../services/tenant-resolution.service';
import { UnregisteredNumberException } from '../services/unregistered-number.exception';
import {
  TENANT_CONTEXT_KEY,
  TenantContext,
  attachTenantContext,
} from './tenant-context';

type RequestWithTenant = {
  body?: {
    phone_number?: string;
    to?: string;
    tenant_phone_number?: string;
  };
  query?: { phone_number?: string };
  headers?: Record<string, string | string[] | undefined>;
  [TENANT_CONTEXT_KEY]?: TenantContext;
};

/**
 * Resolves the inbound WhatsApp recipient number to a tenant context.
 *
 * - Nest HTTP: Nest Guard (`CanActivate`) — rejects unregistered numbers.
 * - BullMQ `IncomingMessageProcessor`: call `resolveForWorker` at the start
 *   of processing (workers are not an HTTP pipeline).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(
    private readonly tenantResolutionService: TenantResolutionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    const phoneNumber = this.extractPhoneNumber(request);

    if (!phoneNumber) {
      this.logger.warn(
        'tenant.guard rejected request: missing phone_number on job/request',
      );
      return false;
    }

    const tenantContext = await this.resolveOrReject(phoneNumber);
    if (!tenantContext) {
      return false;
    }

    request[TENANT_CONTEXT_KEY] = tenantContext;
    return true;
  }

  /**
   * BullMQ / non-HTTP entry point. Returns `null` when the number is
   * unregistered (caller must drop the message). On success, optionally
   * attaches context onto `payload` for downstream steps.
   */
  async resolveForWorker(
    phoneNumber: string,
    payload?: object,
  ): Promise<TenantContext | null> {
    const tenantContext = await this.resolveOrReject(phoneNumber);
    if (tenantContext && payload) {
      attachTenantContext(payload, tenantContext);
    }
    return tenantContext;
  }

  private async resolveOrReject(
    phoneNumber: string,
  ): Promise<TenantContext | null> {
    try {
      const resolved =
        await this.tenantResolutionService.resolveTenantFromPhoneNumber(
          phoneNumber,
        );

      return {
        tenant_id: resolved.tenant_id,
        number_role: resolved.number_role,
        phone_number: phoneNumber,
      };
    } catch (error) {
      if (error instanceof UnregisteredNumberException) {
        this.logger.warn(
          `tenant.guard rejected unregistered number (drop): ${phoneNumber}`,
        );
        return null;
      }
      throw error;
    }
  }

  private extractPhoneNumber(request: RequestWithTenant): string | undefined {
    const fromBody =
      request.body?.phone_number ??
      request.body?.tenant_phone_number ??
      request.body?.to;
    if (fromBody) {
      return fromBody;
    }

    if (request.query?.phone_number) {
      return request.query.phone_number;
    }

    const header = request.headers?.['x-tenant-phone'];
    if (typeof header === 'string' && header.length > 0) {
      return header;
    }
    if (Array.isArray(header) && header[0]) {
      return header[0];
    }

    return undefined;
  }
}
