import { ExecutionContext } from '@nestjs/common';
import { NumberRole } from '@prisma/client';
import { TenantGuard } from './tenant.guard';
import { FinanceRoleGuard } from './finance-role.guard';
import { TENANT_CONTEXT_KEY } from './tenant-context';
import { UnregisteredNumberException } from '../services/unregistered-number.exception';

describe('TenantGuard', () => {
  const resolveTenantFromPhoneNumber = jest.fn();
  const tenantResolutionService = { resolveTenantFromPhoneNumber };
  const guard = new TenantGuard(tenantResolutionService as never);

  beforeEach(() => {
    resolveTenantFromPhoneNumber.mockReset();
  });

  function mockHttpContext(body: Record<string, unknown>) {
    const request: Record<string, unknown> = { body, headers: {}, query: {} };
    return {
      request,
      context: {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext,
    };
  }

  it('rejects unregistered numbers and does not continue', async () => {
    resolveTenantFromPhoneNumber.mockRejectedValue(
      new UnregisteredNumberException('+201000000000'),
    );
    const { context, request } = mockHttpContext({
      phone_number: '+201000000000',
    });

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(request[TENANT_CONTEXT_KEY]).toBeUndefined();
  });

  it('attaches tenant_id and number_role to the request context', async () => {
    resolveTenantFromPhoneNumber.mockResolvedValue({
      tenant_id: 'tenant-1',
      number_role: NumberRole.PUBLIC_SALES,
    });
    const { context, request } = mockHttpContext({
      phone_number: '+201111111111',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request[TENANT_CONTEXT_KEY]).toEqual({
      tenant_id: 'tenant-1',
      number_role: NumberRole.PUBLIC_SALES,
      phone_number: '+201111111111',
    });
  });

  it('resolveForWorker returns null for unregistered numbers', async () => {
    resolveTenantFromPhoneNumber.mockRejectedValue(
      new UnregisteredNumberException('+20999'),
    );
    await expect(guard.resolveForWorker('+20999')).resolves.toBeNull();
  });
});

describe('FinanceRoleGuard', () => {
  const guard = new FinanceRoleGuard();

  it('rejects PUBLIC_SALES attempting settlement', () => {
    expect(
      guard.assertAuthorizedFinance({
        tenant_id: 't1',
        number_role: NumberRole.PUBLIC_SALES,
        phone_number: '+201',
      }),
    ).toBe(false);
  });

  it('allows AUTHORIZED_FINANCE', () => {
    expect(
      guard.assertAuthorizedFinance({
        tenant_id: 't1',
        number_role: NumberRole.AUTHORIZED_FINANCE,
        phone_number: '+202',
      }),
    ).toBe(true);
  });

  it('rejects missing tenant context', () => {
    expect(guard.assertAuthorizedFinance(undefined)).toBe(false);
  });
});
