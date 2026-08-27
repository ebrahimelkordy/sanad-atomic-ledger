import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedPrincipal, PermissionGrant } from '../domain/identity/principal';

const PERMISSION_KEY = 'required_permissions';

export interface PermissionRequirement extends PermissionGrant {}

/**
 * Usage on controllers:
 *
 *   @RequirePermission({ resource: 'sale', action: 'create' })
 *   @RequirePermission([{ resource: 'finance.ledger', action: '*' }, ...])
 *
 * Owner role always passes (evaluated via principal.isOwner()).
 */
export const RequirePermission = (...permissions: PermissionRequirement[]) =>
  SetMetadata(PERMISSION_KEY, permissions);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirements = this.reflector.getAllAndOverride<PermissionRequirement[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requirements || requirements.length === 0) return true; // no restriction

    const req = context.switchToHttp().getRequest();
    const principal = req.principal as AuthenticatedPrincipal | undefined;
    if (!principal) throw new UnauthorizedException('Authentication required');
    if (principal.isOwner()) return true; // Owner = everything allowed

    const ok = principal.hasAnyPermission(requirements);
    if (!ok) {
      const required = requirements.map(r => `${r.resource}:${r.action}`).join(', ');
      throw new ForbiddenException(`Missing required permissions: [${required}] for user ${principal.email}`);
    }
    return true;
  }
}
