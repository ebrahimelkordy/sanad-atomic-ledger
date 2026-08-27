import { AuthenticatedPrincipal, RoleAssignment, PermissionGrant, DefaultPrincipal } from '../../domain/identity/principal';
import { LoginAttemptAuditData } from '../../domain/identity/principal';

export const IIdentityRepository = Symbol('IIdentityRepository');
export interface IIdentityRepository {
  findPrincipalByEmail(email: string): Promise<AuthenticatedPrincipal | null>;
  findPrincipalById(id: string): Promise<AuthenticatedPrincipal | null>;
  createTenantUser(input: {
    actingPrincipal: AuthenticatedPrincipal;
    name: string;
    email: string;
    passwordHash: string;
    phone?: string | null;
    roleIds: string[];
  }): Promise<{ userId: string; }>;
  setUserStatus(actingPrincipal: AuthenticatedPrincipal, userId: string, status: 'ACTIVE'|'DISABLED'|'LOCKED'): Promise<void>;
  listUsers(tenantId: string): Promise<Array<{ userId: string; name: string; email: string; phone: string | null; roles: RoleAssignment[]; status: string; created_at: Date; }>>;
  assignRole(actingPrincipal: AuthenticatedPrincipal, userId: string, roleId: string): Promise<void>;
  unassignRole(actingPrincipal: AuthenticatedPrincipal, userId: string, roleId: string): Promise<void>;
  recordLoginAudit(data: LoginAttemptAuditData): Promise<void>;
  /** Seeded default roles on tenant onboarding: OWNER, FINANCE_MANAGER, ACCOUNTANT_CLERK, INVENTORY_MANAGER, SALES_AGENT + all permissions seeds for tenant id */
  ensureDefaultRolesAndPermissions(tenantId: string): Promise<void>;
}

export const DEFAULT_SYSTEM_ROLES: Array<{ code: string; name: string; description: string; grants: PermissionGrant[] }> = [
  {
    code: 'OWNER', name: 'مالك الشركة', description: 'صلاحيات كاملة بدون قيود',
    grants: [
      { resource: '*', action: '*' }, // super wildcard handled at permission evaluator
    ],
  },
  {
    code: 'FINANCE_MANAGER', name: 'مدير مالي', description: 'إدارة شاملة المالية والمخزون مع صلاحيات الموافقة',
    grants: [
      { resource: 'finance.ledger', action: 'read' },
      { resource: 'finance.ledger', action: 'write' },
      { resource: 'finance.settlement', action: 'approve' },
      { resource: 'finance.period', action: 'close' },
      { resource: 'sale', action: '*' },
      { resource: 'purchase', action: '*' },
      { resource: 'inventory', action: '*' },
      { resource: 'payroll', action: '*' },
      { resource: 'supplier', action: '*' },
      { resource: 'report', action: '*' },
      { resource: 'report.financial', action: '*' },
      { resource: 'user', action: 'read' },
    ],
  },
  {
    code: 'ACCOUNTANT_CLERK', name: 'محاسب', description: 'إدخال بيانات مالية ومخزنية وقراءة تقارير',
    grants: [
      { resource: 'finance.ledger', action: 'read' },
      { resource: 'sale', action: 'create' },
      { resource: 'sale', action: 'read' },
      { resource: 'sale.payment', action: 'create' },
      { resource: 'inventory', action: 'read' },
      { resource: 'supplier', action: 'read' },
      { resource: 'report', action: 'read' },
    ],
  },
  {
    code: 'INVENTORY_MANAGER', name: 'مدير مخازن', description: 'إدارة المخزون والمنتجات والموردين',
    grants: [
      { resource: 'inventory', action: '*' },
      { resource: 'supplier', action: '*' },
      { resource: 'purchase', action: 'create' },
      { resource: 'purchase', action: 'read' },
      { resource: 'report.inventory', action: '*' },
    ],
  },
  {
    code: 'SALES_AGENT', name: 'مندوب مبيعات', description: 'إنشاء فواتير مبيعات وعملاء فقط',
    grants: [
      { resource: 'sale', action: 'create' },
      { resource: 'sale', action: 'read' },
      { resource: 'customer', action: '*' },
      { resource: 'inventory', action: 'read' },
    ],
  },
];
