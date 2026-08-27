import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../repositories/prisma.service';

export interface DefaultCOAAccount {
  code: string;
  name_ar: string;
  name_en?: string;
  account_type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  parent_code?: string;
  is_leaf: boolean;
}

export const DEFAULT_CHART_OF_ACCOUNTS: DefaultCOAAccount[] = [
  // 1. الأصول
  { code: '1', name_ar: 'الأصول', name_en: 'Assets', account_type: 'ASSET', is_leaf: false },
  { code: '1.1', name_ar: 'الأصول المتداولة', name_en: 'Current Assets', account_type: 'ASSET', parent_code: '1', is_leaf: false },
  { code: '1.1.1', name_ar: 'الصندوق والنقدية', name_en: 'Cash and Cash Equivalents', account_type: 'ASSET', parent_code: '1.1', is_leaf: true },
  { code: '1.1.2', name_ar: 'المدينون والعملاء', name_en: 'Accounts Receivable', account_type: 'ASSET', parent_code: '1.1', is_leaf: true },
  { code: '1.1.3', name_ar: 'المخزون السلعي', name_en: 'Inventory', account_type: 'ASSET', parent_code: '1.1', is_leaf: true },

  // 2. الخصوم
  { code: '2', name_ar: 'الخصوم والالتزامات', name_en: 'Liabilities', account_type: 'LIABILITY', is_leaf: false },
  { code: '2.1', name_ar: 'الخصوم المتداولة', name_en: 'Current Liabilities', account_type: 'LIABILITY', parent_code: '2', is_leaf: false },
  { code: '2.1.1', name_ar: 'الدائنون والموردون', name_en: 'Accounts Payable', account_type: 'LIABILITY', parent_code: '2.1', is_leaf: true },
  { code: '2.1.2', name_ar: 'مستحقات الرواتب والعمالة', name_en: 'Accrued Payroll', account_type: 'LIABILITY', parent_code: '2.1', is_leaf: true },

  // 3. حقوق الملكية
  { code: '3', name_ar: 'حقوق الملكية', name_en: 'Equity', account_type: 'EQUITY', is_leaf: false },
  { code: '3.1', name_ar: 'رأس المال', name_en: 'Capital', account_type: 'EQUITY', parent_code: '3', is_leaf: true },
  { code: '3.2', name_ar: 'الأرباح المبقاة', name_en: 'Retained Earnings', account_type: 'EQUITY', parent_code: '3', is_leaf: true },

  // 4. الإيرادات
  { code: '4', name_ar: 'الإيرادات', name_en: 'Revenues', account_type: 'REVENUE', is_leaf: false },
  { code: '4.1', name_ar: 'إيرادات المبيعات', name_en: 'Sales Revenue', account_type: 'REVENUE', parent_code: '4', is_leaf: true },

  // 5. المصروفات
  { code: '5', name_ar: 'المصروفات', name_en: 'Expenses', account_type: 'EXPENSE', is_leaf: false },
  { code: '5.1', name_ar: 'تكلفة البضاعة المباعة', name_en: 'Cost of Goods Sold (COGS)', account_type: 'EXPENSE', parent_code: '5', is_leaf: true },
  { code: '5.2', name_ar: 'مصروفات الرواتب والأجور', name_en: 'Payroll Expense', account_type: 'EXPENSE', parent_code: '5', is_leaf: true },
  { code: '5.3', name_ar: 'مصروفات عمومية وإدارية', name_en: 'General & Admin Expense', account_type: 'EXPENSE', parent_code: '5', is_leaf: true },
];

@Injectable()
export class ChartOfAccountSeedService {
  private readonly logger = new Logger(ChartOfAccountSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Seeds default Chart of Accounts tree for a newly onboarded tenant.
   */
  async seedDefaultAccounts(tenantId: string): Promise<void> {
    this.logger.log(`Seeding default Chart of Accounts for tenant ${tenantId}...`);

    const createdAccounts = new Map<string, string>(); // code -> id

    for (const acc of DEFAULT_CHART_OF_ACCOUNTS) {
      let parentId: string | undefined = undefined;
      if (acc.parent_code) {
        parentId = createdAccounts.get(acc.parent_code);
      }

      const created = await this.prisma.chartOfAccount.upsert({
        where: {
          tenant_id_code: {
            tenant_id: tenantId,
            code: acc.code,
          },
        },
        update: {},
        create: {
          tenant_id: tenantId,
          code: acc.code,
          name_ar: acc.name_ar,
          name_en: acc.name_en,
          account_type: acc.account_type,
          parent_id: parentId,
          is_leaf: acc.is_leaf,
        },
      });

      createdAccounts.set(acc.code, created.id);
    }

    this.logger.log(`✅ Chart of Accounts seeded for tenant ${tenantId}`);
  }

  /**
   * Resolves appropriate default COA leaf account ID by domain context (e.g. Sales, COGS, Accounts Receivable).
   */
  async getDefaultAccountId(tenantId: string, accountCode: string): Promise<string | null> {
    const acc = await this.prisma.chartOfAccount.findUnique({
      where: { tenant_id_code: { tenant_id: tenantId, code: accountCode } },
      select: { id: true },
    });
    return acc?.id ?? null;
  }
}
