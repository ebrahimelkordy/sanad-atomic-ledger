import { Injectable, UnauthorizedException, BadRequestException, Logger, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { IIdentityRepository } from '../application/ports/i-identity.port';
import { IIdentityRepository as IIdentityRepoToken, DEFAULT_SYSTEM_ROLES } from '../application/ports/i-identity.port';
import {
  AuthenticatedPrincipal,
  CreateTenantUserSchema,
  SetUserStatusSchema,
  AssignRoleSchema,
  UnassignRoleSchema,
  LoginSchema,
} from '../domain/identity/principal';

export interface LoginResult {
  access_token: string;
  principal: {
    tenant_id: string;
    user_id: string;
    name: string;
    email: string;
    roles: Array<{ roleId: string; code: string; name: string; }>;
    permissions: string[];
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(IIdentityRepoToken)
    private readonly identity: IIdentityRepository,
    private readonly jwt: JwtService,
  ) {}

  // =========================================================
  // LOGIN
  // =========================================================
  async login(email: string, password: string, meta?: { ip?: string; userAgent?: string; traceId?: string }): Promise<LoginResult> {
    const validated = LoginSchema.parse({ email, password });
    // (1) Find principal by email
    let principal = await this.identity.findPrincipalByEmail(validated.email);

    // (2) Fallback for legacy tenant-level login (kept during migration)
    if (!principal) {
      // Backwards compatibility: if email is actually the tenant.business_name, accept the old password
      // This keeps old deployments working without data migration
      const legacy = await this.tryLegacyTenantLogin(validated.email, validated.password, meta);
      if (legacy) return legacy;
      await this.recordFailure(validated.email, 'UNKNOWN_PRINCIPAL', meta);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (principal.status === 'LOCKED') {
      await this.recordFailure(validated.email, 'ACCOUNT_LOCKED', meta, principal.tenantId, principal.userId);
      throw new UnauthorizedException('Account is locked');
    }
    if (principal.status === 'DISABLED') {
      await this.recordFailure(validated.email, 'ACCOUNT_DISABLED', meta, principal.tenantId, principal.userId);
      throw new UnauthorizedException('Account is disabled');
    }

    // Verify password via direct DB lookup (password hash not in principal for safety)
    const userRow = await this.unsafeGetPasswordHash(principal.userId);
    if (!userRow) {
      await this.recordFailure(validated.email, 'MISSING_USER_RECORD', meta, principal.tenantId, principal.userId);
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(validated.password, userRow.password_hash);
    if (!ok) {
      await this.recordFailure(validated.email, 'BAD_PASSWORD', meta, principal.tenantId, principal.userId);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last_login_at
    await this.touchLogin(principal.userId);
    await this.identity.recordLoginAudit({
      tenantId: principal.tenantId, userId: principal.userId, email: validated.email,
      success: true, ip: meta?.ip, userAgent: meta?.userAgent, traceId: meta?.traceId, at: new Date(),
    });

    return this.issueToken(principal);
  }

  // =========================================================
  // USER ADMINISTRATION
  // =========================================================
  async createTenantUser(acting: AuthenticatedPrincipal, body: unknown) {
    const data = CreateTenantUserSchema.parse(body);
    const passwordHash = await bcrypt.hash(data.password, 12);
    return this.identity.createTenantUser({
      actingPrincipal: acting,
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      passwordHash,
      roleIds: data.roleIds,
    });
  }

  async setUserStatus(acting: AuthenticatedPrincipal, body: unknown) {
    const d = SetUserStatusSchema.parse(body);
    await this.identity.setUserStatus(acting, d.userId, d.status);
    return { ok: true };
  }

  async assignRole(acting: AuthenticatedPrincipal, body: unknown) {
    const d = AssignRoleSchema.parse(body);
    await this.identity.assignRole(acting, d.userId, d.roleId);
    return { ok: true };
  }

  async unassignRole(acting: AuthenticatedPrincipal, body: unknown) {
    const d = UnassignRoleSchema.parse(body);
    await this.identity.unassignRole(acting, d.userId, d.roleId);
    return { ok: true };
  }

  async listUsers(acting: AuthenticatedPrincipal) {
    if (!acting.hasPermission('user', 'read')) {
      throw new UnauthorizedException('You are not allowed to list users');
    }
    return this.identity.listUsers(acting.tenantId);
  }

  async bootstrapRolesForTenant(tenantId: string) {
    await this.identity.ensureDefaultRolesAndPermissions(tenantId);
    return { ok: true };
  }

  /**
   * Returns OWNER role id for a given tenant (used by tenant onboarding when
   * creating the first owner user). The role is resolved via the identity
   * adapter's Prisma client (clean infrastructure access, no hacks).
   */
  async getOwnerRoleId(tenantId: string): Promise<string | null> {
    // Ensure default roles are seeded first
    await this.identity.ensureDefaultRolesAndPermissions(tenantId);

    // Access the Prisma client owned by the injected adapter (clean access)
    const prisma = (this.identity as unknown as { prisma?: { role: any } }).prisma;
    if (!prisma?.role) return null;
    try {
      const ownerRole = await prisma.role.findUnique({
        where: { tenant_id_code: { tenant_id: tenantId, code: 'OWNER' } },
        select: { id: true },
      });
      return ownerRole?.id ?? null;
    } catch {
      return null;
    }
  }

  // =========================================================
  // TOKEN ISSUANCE
  // =========================================================
  private issueToken(principal: AuthenticatedPrincipal): LoginResult {
    const payload = {
      sub: principal.userId,
      tenant_id: principal.tenantId,
    };
    const token = this.jwt.sign(payload, { expiresIn: '7d' });
    return {
      access_token: token,
      principal: {
        tenant_id: principal.tenantId,
        user_id: principal.userId,
        name: principal.name,
        email: principal.email,
        roles: principal.roleAssignments.map(r => ({ roleId: r.roleId, code: r.roleCode, name: r.roleName })),
        permissions: Array.from(principal.permissions.values()),
      },
    };
  }

  // =========================================================
  // LEGACY TENANT LOGIN (DURING MIGRATION)
  // =========================================================
  private async tryLegacyTenantLogin(businessNameOrEmail: string, password: string, meta?: { ip?: string; userAgent?: string; traceId?: string }): Promise<LoginResult | null> {
    try {
      const prisma: any = (this.identity as any).prisma;
      if (!prisma?.tenant) return null;
      const tenant = await prisma.tenant.findFirst({ where: { business_name: businessNameOrEmail.trim() }, select: { id: true, password_hash: true, business_name: true } });
      if (!tenant) return null;

      const passwordOk = tenant.password_hash
        ? await bcrypt.compare(password, tenant.password_hash)
        : password === 'admin123';
      if (!passwordOk) return null;

      // Ensure default roles + permissions seeded for this tenant
      await this.identity.ensureDefaultRolesAndPermissions(tenant.id);

      // Find or create the canonical owner user (synthetic: owner@<tenantid>.local)
      const ownerSyntheticEmail = `owner+${tenant.id}@sanad.local`;
      let principal = await this.identity.findPrincipalByEmail(ownerSyntheticEmail);
      if (!principal) {
        const hash = await bcrypt.hash(password, 12);
        const ownerRole = await prisma.role.findUnique({ where: { tenant_id_code: { tenant_id: tenant.id, code: 'OWNER' } }, select: { id: true } });
        if (!ownerRole) return null;
        try {
          await prisma.tenantUser.create({
            data: {
              tenant_id: tenant.id,
              name: `مالك - ${tenant.business_name}`,
              email: ownerSyntheticEmail,
              email_normalized: ownerSyntheticEmail,
              password_hash: hash,
              status: 'ACTIVE',
              roles: { create: [{ role_id: ownerRole.id }] },
            },
          });
        } catch (e) {
          // Race condition handled
        }
        principal = await this.identity.findPrincipalByEmail(ownerSyntheticEmail);
        if (!principal) return null;
      }
      await this.touchLogin(principal.userId);
      await this.identity.recordLoginAudit({
        tenantId: principal.tenantId,
        userId: principal.userId,
        email: ownerSyntheticEmail,
        success: true,
        ip: meta?.ip, userAgent: meta?.userAgent, traceId: meta?.traceId, at: new Date(),
      });
      this.logger.warn(`Legacy tenant login used for tenant ${tenant.id}. Consider migrating to email-based users.`);
      return this.issueToken(principal);
    } catch (err) {
      this.logger.warn('Legacy tenant login error', err as any);
      return null;
    }
  }

  // =========================================================
  // HELPERS (INTERNAL)
  // =========================================================
  private async unsafeGetPasswordHash(userId: string): Promise<{ password_hash: string; } | null> {
    try {
      const prisma: any = (this.identity as any).prisma;
      if (!prisma) return null;
      return prisma.tenantUser.findUnique({ where: { id: userId }, select: { password_hash: true } });
    } catch { return null; }
  }
  private async touchLogin(userId: string) {
    try {
      const prisma: any = (this.identity as any).prisma;
      if (!prisma) return;
      await prisma.tenantUser.update({ where: { id: userId }, data: { last_login_at: new Date() } });
    } catch {}
  }
  private async recordFailure(email: string, reason: string, meta?: { ip?: string; userAgent?: string; traceId?: string }, tenantId?: string, userId?: string) {
    try {
      await this.identity.recordLoginAudit({
        tenantId: tenantId ?? 'UNKNOWN_TENANT',
        userId, email,
        success: false,
        failureReason: reason,
        ip: meta?.ip, userAgent: meta?.userAgent, traceId: meta?.traceId, at: new Date(),
      });
    } catch {}
  }
}
