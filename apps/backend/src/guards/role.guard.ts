import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
export const ROLES_KEY = 'allowed_roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!allowedRoles || allowedRoles.length === 0) {
      return true; // No role restriction = allow
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Role ${user.role} is not authorized to access this endpoint. Required: ${allowedRoles.join(', ')}`,
      );
    }
    return true;
  }
}
