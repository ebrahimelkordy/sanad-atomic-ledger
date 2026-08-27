import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { IIdentityRepository } from '../application/ports/i-identity.port';
import { IIdentityRepository as IIdentityRepoToken } from '../application/ports/i-identity.port';
import { AuthenticatedPrincipal } from '../domain/identity/principal';

export interface JwtPayload {
  sub: string;          // TenantUser.id
  tenant_id: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    @Inject(IIdentityRepoToken)
    private readonly identity: IIdentityRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedPrincipal> {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid token');
    }
    const principal = await this.identity.findPrincipalById(payload.sub);
    if (!principal) {
      throw new UnauthorizedException('Principal for token no longer exists');
    }
    if (principal.status === 'LOCKED') throw new UnauthorizedException('Account is locked');
    if (principal.status === 'DISABLED') throw new UnauthorizedException('Account is disabled');
    if (principal.tenantId !== payload.tenant_id) {
      throw new UnauthorizedException('Token tenant mismatch');
    }
    return principal;
  }
}
