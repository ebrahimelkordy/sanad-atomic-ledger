import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { NumberRole } from '@prisma/client';

/** Key used to store resolved tenant context on HTTP request / job payload. */
export const TENANT_CONTEXT_KEY = 'tenantContext';

/**
 * Tenant context resolved by `tenant.guard` and consumed by subsequent
 * services/guards without re-resolving the phone number.
 */
export type TenantContext = {
  tenant_id: string;
  number_role: NumberRole;
  phone_number: string;
};

/**
 * Nest parameter decorator — reads the tenant context previously attached
 * by `TenantGuard` on the HTTP request.
 */
export const TenantCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext | undefined => {
    const request = ctx.switchToHttp().getRequest<{
      [TENANT_CONTEXT_KEY]?: TenantContext;
    }>();
    return request[TENANT_CONTEXT_KEY];
  },
);

/**
 * Attach tenant context to a mutable BullMQ job payload (or any plain object)
 * so downstream workers/services can read `tenant_id` / `number_role`.
 */
export function attachTenantContext<T extends object>(
  payload: T,
  context: TenantContext,
): T & { [TENANT_CONTEXT_KEY]: TenantContext } {
  return Object.assign(payload, { [TENANT_CONTEXT_KEY]: context });
}

export function getTenantContextFromPayload(payload: {
  [TENANT_CONTEXT_KEY]?: TenantContext;
}): TenantContext | undefined {
  return payload[TENANT_CONTEXT_KEY];
}
