import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedPrincipal } from '../domain/identity/principal';

/**
 * Passport JWT guard that authenticates the request and populates BOTH
 * `req.user` (legacy, Passport convention) and `req.principal` (canonical
 * Clean-Architecture principal) with the same `AuthenticatedPrincipal`.
 *
 * `req.principal` is the official source going forward. `req.user` is kept
 * populated for backwards compatibility with controllers still migrating.
 *
 * Guards like `PermissionGuard` and `PeriodLockGuard` read `req.principal`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;

    const request = context.switchToHttp().getRequest();
    const principal = request.user as AuthenticatedPrincipal | undefined;
    if (!principal) {
      throw new UnauthorizedException('Authentication required');
    }

    // Canonical principal — Clean Architecture port for guards/interceptors/services
    request.principal = principal;
    return true;
  }
}

