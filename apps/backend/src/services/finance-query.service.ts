import { Injectable } from '@nestjs/common';
import { LedgerEntryRepository } from '../repositories/ledger-entry.repository';
import { FinancialLedgerSummaryRepository } from '../repositories/financial-ledger-summary.repository';
import { PrismaService } from '../repositories/prisma.service';

@Injectable()
export class FinanceQueryService {
  constructor(
    private readonly ledgerRepo: LedgerEntryRepository,
    private readonly summaryRepo: FinancialLedgerSummaryRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getLedger(tenantId: string, partyIdentifier?: string) {
    return this.ledgerRepo.findByTenant(tenantId, partyIdentifier);
  }

  async getSummary(tenantId: string, partyIdentifier?: string) {
    // 1. دفتر القيود الأساسي (عملاء + تسويات + مبيعات)
    const ledgerSummaries = await this.summaryRepo.findByTenant(tenantId, partyIdentifier);
    const summaryMap = new Map<string, any>();
    ledgerSummaries.forEach((s) => summaryMap.set(s.party_identifier, s));

    // 2. الموظفين: حساب صافي ما يستحق لكل موظف
    if (!partyIdentifier) {
      const employees = await this.prisma.employee.findMany({
        where: { tenant_id: tenantId },
        include: {
          transactions: true,
          attendances: true,
        },
      });

      for (const emp of employees) {
        const key = `موظف: ${emp.name}`;
        if (summaryMap.has(key)) continue; // لو موجود مسبقاً في القيود

        // حساب المستحق الإجمالي
        const baseRate = Number(emp.base_rate || 0);
        let totalAdvances = 0, totalDeductions = 0, totalBonuses = 0, totalPaid = 0;
        for (const tx of emp.transactions || []) {
          const amt = Number(tx.amount || 0);
          if (tx.type === 'ADVANCE') totalAdvances += amt;
          else if (tx.type === 'DEDUCTION') totalDeductions += amt;
          else if (tx.type === 'BONUS') totalBonuses += amt;
          else if (tx.type === 'PAYROLL_PAYMENT') totalPaid += amt;
        }

        const netDue = baseRate + totalBonuses - totalAdvances - totalDeductions - totalPaid;

        summaryMap.set(key, {
          party_identifier: key,
          total_debit: totalAdvances + totalDeductions,
          total_credit: totalBonuses + totalPaid,
          running_balance: netDue,
          last_recalculated_at: new Date(),
          source: 'employee',
        });
      }

      // 3. العملاء المسجلون بدون قيود في الدفتر
      const customers = await this.prisma.customer.findMany({
        where: { tenant_id: tenantId },
      });
      for (const cust of customers) {
        const key = cust.name;
        if (!summaryMap.has(key) && !summaryMap.has(cust.phone)) {
          summaryMap.set(key, {
            party_identifier: key,
            total_debit: 0,
            total_credit: 0,
            running_balance: 0,
            last_recalculated_at: cust.created_at,
            source: 'customer',
          });
        }
      }
    }

    return Array.from(summaryMap.values());
  }
}
