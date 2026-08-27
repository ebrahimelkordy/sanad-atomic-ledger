import { z } from 'zod';

// ===================== RBAC DOMAIN TYPES =====================
export interface PermissionGrant {
  resource: string;
  action: string;
}

export interface RoleAssignment {
  userId: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  isSystem: boolean;
  permissions: PermissionGrant[];
}

export interface LoginAttemptAuditData {
  tenantId: string;
  userId?: string;
  email: string;
  success: boolean;
  ip?: string;
  userAgent?: string;
  traceId?: string;
  failureReason?: string;
  at: Date;
}

// ===================== PRINCIPAL =====================
export interface AuthenticatedPrincipal {
  tenantId: string;
  userId: string;
  name: string;
  email: string;
  roleAssignments: RoleAssignment[];
  permissions: Set<string>; // e.g. "sale:create", "finance.ledger:read"
  status: 'ACTIVE' | 'DISABLED' | 'LOCKED';
  hasPermission(resource: string, action: string): boolean;
  hasAnyPermission(grants: Array<{ resource: string; action: string }>): boolean;
  isOwner(): boolean; // any system role code = OWNER
}

export class DefaultPrincipal implements AuthenticatedPrincipal {
  public readonly permissions: Set<string>;
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly name: string,
    public readonly email: string,
    public readonly roleAssignments: RoleAssignment[],
    public readonly status: 'ACTIVE' | 'DISABLED' | 'LOCKED',
    permissionList: PermissionGrant[],
  ) {
    this.permissions = new Set(permissionList.map(p => `${p.resource}:${p.action}`));
  }
  hasPermission(resource: string, action: string): boolean {
    if (this.isOwner()) return true; // Owner = full super-user grant (all permissions)
    // support wildcard grants
    if (this.permissions.has(`${resource}:*`)) return true;
    if (this.permissions.has(`*:${action}`)) return true;
    if (this.permissions.has(`*:*`)) return true;
    return this.permissions.has(`${resource}:${action}`);
  }
  hasAnyPermission(grants: PermissionGrant[]): boolean {
    return grants.some(g => this.hasPermission(g.resource, g.action));
  }
  isOwner(): boolean {
    return this.roleAssignments.some(r => r.roleCode === 'OWNER');
  }
}

// ===================== ZOD SCHEMAS — STRONG VALIDATION =====================
export const CreateTenantUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  phone: z.string().max(32).nullable().optional(),
  roleIds: z.array(z.string().uuid()).min(1, 'At least one role is required'),
});

export const AssignRoleSchema = z.object({ userId: z.string().uuid(), roleId: z.string().uuid() });
export const UnassignRoleSchema = z.object({ userId: z.string().uuid(), roleId: z.string().uuid() });
export const SetUserStatusSchema = z.object({ userId: z.string().uuid(), status: z.enum(['ACTIVE','DISABLED','LOCKED']) });

export const LoginSchema = z.object({
  email: z.string().min(3, 'Login identifier is required').max(254),
  password: z.string().min(1, 'Password is required').max(128),
});
