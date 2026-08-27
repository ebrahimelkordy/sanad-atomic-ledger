import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../repositories/prisma.service';
import { ICoaPort, ChartOfAccountRow } from '../../application/ports/i-coa.port';

@Injectable()
export class PrismaCoaAdapter implements ICoaPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByCode(tenantId: string, code: string): Promise<ChartOfAccountRow | null> {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { tenant_id: tenantId, code, is_active: true },
      select: {
        id: true,
        tenant_id: true,
        code: true,
        name_ar: true,
        account_type: true,
        parent_id: true,
        is_active: true,
      },
    });

    if (!account) return null;

    return {
      id: account.id,
      tenantId: account.tenant_id,
      code: account.code,
      name: account.name_ar, // Using Arabic name as the primary name for now
      type: account.account_type as 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
      parentId: account.parent_id ?? null,
      isActive: account.is_active,
    };
  }

  async findAllByTenant(tenantId: string): Promise<ChartOfAccountRow[]> {
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { tenant_id: tenantId, is_active: true },
      select: {
        id: true,
        tenant_id: true,
        code: true,
        name_ar: true,
        account_type: true,
        parent_id: true,
        is_active: true,
      },
      orderBy: { code: 'asc' },
    });

    return accounts.map(acc => ({
      id: acc.id,
      tenantId: acc.tenant_id,
      code: acc.code,
      name: acc.name_ar,
      type: acc.account_type as 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
      parentId: acc.parent_id ?? null,
      isActive: acc.is_active,
    }));
  }

  async create(input: {
    tenantId: string;
    code: string;
    name: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
    parentId?: string | null;
  }): Promise<string> {
    const account = await this.prisma.chartOfAccount.create({
      data: {
        tenant_id: input.tenantId,
        code: input.code,
        name_ar: input.name,
        account_type: input.type,
        parent_id: input.parentId ?? null,
        is_active: true,
      },
      select: { id: true },
    });

    return account.id;
  }

  async update(id: string, input: Partial<{
    name: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
    parentId?: string | null;
    isActive: boolean;
  }>): Promise<void> {
    await this.prisma.chartOfAccount.update({
      where: { id },
      data: {
        name_ar: input.name,
        account_type: input.type,
        parent_id: input.parentId ?? null,
        is_active: input.isActive,
      },
    });
  }

  async deactivate(id: string): Promise<void> {
    await this.prisma.chartOfAccount.update({
      where: { id },
      data: { is_active: false },
    });
  }
}