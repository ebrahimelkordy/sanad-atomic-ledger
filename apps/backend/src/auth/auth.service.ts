import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { TenantRepository } from '../repositories/tenant.repository';

@Injectable()
export class AuthService {
  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly jwtService: JwtService,
  ) {}

  async login(tenantName: string, password: string) {
    const tenant = await this.tenantRepo.findByName(tenantName);
    if (!tenant) {
      throw new UnauthorizedException('Tenant not found');
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      tenant.password_hash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: tenant.id };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
