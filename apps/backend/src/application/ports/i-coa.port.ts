// src/application/ports/i-coa.port.ts
export interface ChartOfAccountRow {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  parentId: string | null;
  isActive: boolean;
}

export interface ICoaPort {
  // Find COA by tenant and code
  findByCode(tenantId: string, code: string): Promise<ChartOfAccountRow | null>;

  // Find all active COA for a tenant (for tree building)
  findAllByTenant(tenantId: string): Promise<ChartOfAccountRow[]>;

  // Create a new COA node
  create(input: {
    tenantId: string;
    code: string;
    name: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
    parentId?: string | null;
  }): Promise<string>; // returns the created COA id

  // Update an existing COA
  update(id: string, input: Partial<{
    name: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
    parentId?: string | null;
    isActive: boolean;
  }>): Promise<void>;

  // Deactivate (soft delete) a COA
  deactivate(id: string): Promise<void>;
}