import { Injectable, Logger, BadRequestException, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../repositories/prisma.service';
import { IIdentityRepository, DEFAULT_SYSTEM_ROLES } from '../../application/ports/i-identity.port';
import {
  AuthenticatedPrincipal,
  DefaultPrincipal,
  RoleAssignment,
  PermissionGrant,
  LoginAttemptAuditData,
} from '../../domain/identity/principal';

/**
 * Prisma adapter for IIdentityRepository.
 * Responsibility: DB interactions only. No business rules.
 */
@Injectable()
export class PrismaIdentityAdapter implements IIdentityRepository {
  private readonly logger = new Logger(PrismaIdentityAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  // ===============================================================
  // PRINCIPAL LOADING
  // ===============================================================
  async findPrincipalByEmail(email: string): Promise<AuthenticatedPrincipal | null> {
    const normalized = email.toLowerCase().trim();
    const user = await this.prisma.tenantUser.findFirst({
      where: { email_normalized: normalized },
      include: {
        tenant: { select: { id: true } },
        roles: {
          include: {
            role: {
              include: {
                role_permissions: {
                  include: { permission: { select: { resource: true, action: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!user) return null;
    return this.materializePrincipal(user);
  }

  async findPrincipalById(id: string): Promise<AuthenticatedPrincipal | null> {
    const user = await this.prisma.tenantUser.findUnique({
      where: { id },
      include: {
        tenant: { select: { id: true } },
        roles: {
          include: {
            role: {
              include: {
                role_permissions: {
                  include: { permission: { select: { resource: true, action: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!user) return null;
    return this.materializePrincipal(user);
  }

  private materializePrincipal(user: any): AuthenticatedPrincipal {
    const grants: PermissionGrant[] = [];
    const assignments: RoleAssignment[] = user.roles.map((ur: any) => {
      const perms: PermissionGrant[] = ur.role.role_permissions.map((rp: any) => ({
        resource: rp.permission.resource,
        action: rp.permission.action,
      }));
      grants.push(...perms);
      return {
        userId: user.id,
        roleId: ur.role.id,
        roleCode: ur.role.code,
        roleName: ur.role.name,
        isSystem: !!ur.role.is_system,
        permissions: perms,
      };
    });

    return new DefaultPrincipal(
      user.tenant_id,
      user.id,
      user.name,
      user.email,
      assignments,
      (user.status === 'ACTIVE' || user.status === 'DISABLED' || user.status === 'LOCKED') ? user.status : 'ACTIVE',
      grants,
    );
  }

  // ===============================================================
  // DEFAULT ROLES + PERMISSIONS SEEDING
  // ===============================================================
  async ensureDefaultRolesAndPermissions(tenantId: string): Promise<void> {
    for (const seed of DEFAULT_SYSTEM_ROLES) {
      // Upsert role (don't create twice)
      const role = await this.prisma.role.upsert({
        where: { tenant_id_code: { tenant_id: tenantId, code: seed.code } },
        create: {
          tenant_id: tenantId,
          name: seed.name,
          code: seed.code,
          description: seed.description,
          is_system: true,
        },
        update: { description: seed.description },
      });
      // Ensure each permission exists
      for (const grant of seed.grants) {
        const perm = await this.prisma.permission.upsert({
          where: { tenant_id_resource_action: { tenant_id: tenantId, resource: grant.resource, action: grant.action } },
          create: { tenant_id: tenantId, resource: grant.resource, action: grant.action, description: `${grant.resource}:${grant.action}` },
          update: {},
        });
        await this.prisma.rolePermission.upsert({
          where: { role_id_permission_id: { role_id: role.id, permission_id: perm.id } },
          create: { role_id: role.id, permission_id: perm.id },
          update: {},
        });
      }
    }
  }

  // ===============================================================
  // USER MANAGEMENT
  // ===============================================================
  async createTenantUser(input: {
    actingPrincipal: AuthenticatedPrincipal;
    name: string;
    email: string;
    passwordHash: string;
    phone?: string | null;
    roleIds: string[];
  }): Promise<{ userId: string }> {
    const { actingPrincipal, name, email, passwordHash, phone, roleIds } = input;
    const normalized = email.toLowerCase().trim();

    if (!actingPrincipal.hasPermission('user', 'create')) {
      throw new ForbiddenException('You are not allowed to create users');
    }

    const existing = await this.prisma.tenantUser.findUnique({ where: { email_normalized: normalized } });
    if (existing) throw new ConflictException('Email already in use');

    // Validate all roleIds belong to this tenant and are not system-protected being assigned by non-owner
    const roles = await this.prisma.role.findMany({ where: { id: { in: roleIds }, tenant_id: actingPrincipal.tenantId } });
    if (roles.length !== roleIds.length) throw new BadRequestException('One or more role IDs are invalid');

    const user = await this.prisma.tenantUser.create({
      data: {
        tenant_id: actingPrincipal.tenantId,
        name: name.trim(),
        email: email.trim(),
        email_normalized: normalized,
        password_hash: passwordHash,
        phone: phone ?? null,
      },
      select: { id: true },
    });

    await this.prisma.userRole.createMany({
      data: roles.map(r => ({ user_id: user.id, role_id: r.id })),
      skipDuplicates: true,
    });

    return { userId: user.id };
  }

  async setUserStatus(actingPrincipal: AuthenticatedPrincipal, userId: string, status: 'ACTIVE' | 'DISABLED' | 'LOCKED'): Promise<void> {
    if (!actingPrincipal.hasPermission('user', 'update')) {
      throw new ForbiddenException('You are not allowed to modify users');
    }
    const target = await this.prisma.tenantUser.findFirst({ where: { id: userId, tenant_id: actingPrincipal.tenantId }, select: { id: true, roles: { include: { role: { select: { code: true } } } } } });
    if (!target) throw new NotFoundException('User not found');
    // Never allow disabling another owner unless caller is owner themselves
    const targetIsOwner = target.roles.some(r => r.role.code === 'OWNER');
    if (targetIsOwner && !actingPrincipal.isOwner()) {
      throw new ForbiddenException('Only another Owner can modify owner accounts');
    }
    await this.prisma.tenantUser.update({ where: { id: userId }, data: { status } });
  }

  async listUsers(tenantId: string): Promise<any[]> {
    const users = await this.prisma.tenantUser.findMany({
      where: { tenant_id: tenantId },
      include: {
        roles: {
          include: { role: { select: { id: true, name: true, code: true, is_system: true, description: true } } },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    return users.map(u => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      status: u.status,
      created_at: u.created_at,
      last_login_at: u.last_login_at,
      roles: u.roles.map(r => ({
        userId: u.id,
        roleId: r.role_id,
        roleCode: r.role.code,
        roleName: r.role.name,
        isSystem: r.role.is_system,
      })),
    }));
  }

  async assignRole(actingPrincipal: AuthenticatedPrincipal, userId: string, roleId: string): Promise<void> {
    if (!actingPrincipal.hasPermission('user.role', 'assign')) {
      throw new ForbiddenException('You are not allowed to assign roles');
    }
    await this.assertRoleBelongsToTenant(actingPrincipal.tenantId, roleId);
    await this.assertUserBelongsToTenant(actingPrincipal.tenantId, userId);
    await this.prisma.userRole.upsert({
      where: { user_id_role_id: { user_id: userId, role_id: roleId } },
      create: { user_id: userId, role_id: roleId },
      update: {},
    });
  }

  async unassignRole(actingPrincipal: AuthenticatedPrincipal, userId: string, roleId: string): Promise<void> {
    if (!actingPrincipal.hasPermission('user.role', 'revoke')) {
      throw new ForbiddenException('You are not allowed to revoke roles');
    }
    await this.assertRoleBelongsToTenant(actingPrincipal.tenantId, roleId);
    await this.assertUserBelongsToTenant(actingPrincipal.tenantId, userId);
    await this.prisma.userRole.deleteMany({ where: { user_id: userId, role_id: roleId } });
  }

  // ===============================================================
  // AUDIT
  // ===============================================================
  async recordLoginAudit(data: LoginAttemptAuditData): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenant_id: data.tenantId,
          user_id: data.userId ?? null,
          action_type: data.success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILURE',
          entity_type: 'TENANT_USER',
          entity_id: data.userId ?? null,
          old_json: Prisma.JsonNull,
          new_json: {
            email: data.email,
            reason: data.failureReason ?? null,
            success: data.success,
          } as any,
          ip_address: data.ip ?? null,
          user_agent: data.userAgent ?? null,
          trace_id: data.traceId ?? null,
        },
      });
    } catch (e) {
      // Never let audit log break auth
      this.logger.warn('Failed to record login audit', e as any);
    }
  }

  // ===============================================================
  // HELPERS
  // ===============================================================
  private async assertRoleBelongsToTenant(tenantId: string, roleId: string) {
    const r = await this.prisma.role.findUnique({ where: { id: roleId }, select: { tenant_id: true } });
    if (!r || r.tenant_id !== tenantId) throw new BadRequestException('Role does not belong to this tenant');
  }
  private async assertUserBelongsToTenant(tenantId: string, userId: string) {
    const u = await this.prisma.tenantUser.findUnique({ where: { id: userId }, select: { tenant_id: true } });
    if (!u || u.tenant_id !== tenantId) throw new BadRequestException('User does not belong to this tenant');
  }
}
