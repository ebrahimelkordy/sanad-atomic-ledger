import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../repositories/prisma.service';
import { Prisma } from '@prisma/client';

export interface ProfitAndLossReport {
  period: { from?: string; to?: string };
  revenue: {
    total_sales: string;
  };
  cogs: {
    total_cost_of_goods_sold: string;
  };
  gross_profit: string;
  expenses: {
    payroll: string;
    other_expenses: string;
    total_expenses: string;
  };
  net_profit: string;
}

export interface StatementOfAccountItem {
  id: string;
  created_at: Date;
  party_identifier: string;
  entry_type: 'DEBIT' | 'CREDIT';
  amount: string;
  running_balance: string;
  narration?: string | null;
  reference_order_id?: string | null;
  reference_sale_id?: string | null;
}

export interface StatementOfAccountReport {
  party_identifier: string;
  total_debit: string;
  total_credit: string;
  closing_balance: string;
  entries: StatementOfAccountItem[];
}

@Injectable()
export class FinancialReportsService {
  private readonly logger = new Logger(FinancialReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sprint 3A — Task 3.1: Profit and Loss Report (P&L)
   *
   * Calculates Real Revenue, COGS, Gross Profit, Expenses, and Net Profit for a given date range.
   */
  async getProfitAndLoss(
    tenantId: string,
    fromISO?: string,
    toISO?: string,
  ): Promise<ProfitAndLossReport> {
    const whereDate: Prisma.DateTimeFilter = {};
    if (fromISO) whereDate.gte = new Date(fromISO);
    if (toISO) whereDate.lte = new Date(toISO);

    const hasDate = Object.keys(whereDate).length > 0;

    // 1. Sales revenue & COGS from confirmed Sales
    const sales = await this.prisma.sale.findMany({
      where: {
        tenant_id: tenantId,
        status: 'CONFIRMED',
        ...(hasDate ? { invoice_date: whereDate } : {}),
      },
      select: {
        total_amount: true,
        total_cost: true,
        total_profit: true,
      },
    });

    let totalSales = new Prisma.Decimal(0);
    let totalCogs = new Prisma.Decimal(0);

    for (const sale of sales) {
      totalSales = totalSales.plus(sale.total_amount);
      totalCogs = totalCogs.plus(sale.total_cost);
    }

    const grossProfit = totalSales.minus(totalCogs);

    // 2. Payroll expenses from Employee Transactions (BONUS, PAYROLL_PAYMENT)
    const empTxs = await this.prisma.employeeTransaction.findMany({
      where: {
        employee: { tenant_id: tenantId },
        type: { in: ['PAYROLL_PAYMENT', 'BONUS'] },
        ...(hasDate ? { created_at: whereDate } : {}),
      },
      select: { amount: true },
    });

    let totalPayroll = new Prisma.Decimal(0);
    for (const tx of empTxs) {
      totalPayroll = totalPayroll.plus(tx.amount);
    }

    // 3. Other General Expenses from DEBIT Ledger Entries with party_identifier starting with "مصروف"
    const expenseLedgers = await this.prisma.ledgerEntry.findMany({
      where: {
        tenant_id: tenantId,
        entry_type: 'DEBIT',
        party_identifier: { startsWith: 'مصروف' },
        ...(hasDate ? { created_at: whereDate } : {}),
      },
      select: { amount: true },
    });

    let otherExpenses = new Prisma.Decimal(0);
    for (const leg of expenseLedgers) {
      otherExpenses = otherExpenses.plus(leg.amount);
    }

    const totalExpenses = totalPayroll.plus(otherExpenses);
    const netProfit = grossProfit.minus(totalExpenses);

    return {
      period: { from: fromISO, to: toISO },
      revenue: {
        total_sales: totalSales.toFixed(2),
      },
      cogs: {
        total_cost_of_goods_sold: totalCogs.toFixed(2),
      },
      gross_profit: grossProfit.toFixed(2),
      expenses: {
        payroll: totalPayroll.toFixed(2),
        other_expenses: otherExpenses.toFixed(2),
        total_expenses: totalExpenses.toFixed(2),
      },
      net_profit: netProfit.toFixed(2),
    };
  }

  /**
   * Sprint 3A — Task 3.2: Detailed Statement of Account for Customer/Supplier
   */
  async getStatementOfAccount(
    tenantId: string,
    partyIdentifier: string,
    fromISO?: string,
    toISO?: string,
  ): Promise<StatementOfAccountReport> {
    const whereDate: Prisma.DateTimeFilter = {};
    if (fromISO) whereDate.gte = new Date(fromISO);
    if (toISO) whereDate.lte = new Date(toISO);

    const hasDate = Object.keys(whereDate).length > 0;

    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        tenant_id: tenantId,
        party_identifier: partyIdentifier,
        ...(hasDate ? { created_at: whereDate } : {}),
      },
      orderBy: { created_at: 'asc' },
    });

    let runningBalance = new Prisma.Decimal(0);
    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    const statementItems: StatementOfAccountItem[] = entries.map((entry) => {
      const amt = new Prisma.Decimal(entry.amount.toString());
      if (entry.entry_type === 'DEBIT') {
        totalDebit = totalDebit.plus(amt);
        runningBalance = runningBalance.minus(amt);
      } else {
        totalCredit = totalCredit.plus(amt);
        runningBalance = runningBalance.plus(amt);
      }

      return {
        id: entry.id,
        created_at: entry.created_at,
        party_identifier: entry.party_identifier,
        entry_type: entry.entry_type,
        amount: amt.toFixed(2),
        running_balance: runningBalance.toFixed(2),
        narration: entry.narration || entry.raw_message_text,
        reference_order_id: entry.reference_order_id,
        reference_sale_id: entry.reference_sale_id,
      };
    });

    return {
      party_identifier: partyIdentifier,
      total_debit: totalDebit.toFixed(2),
      total_credit: totalCredit.toFixed(2),
      closing_balance: runningBalance.toFixed(2),
      entries: statementItems,
    };
  }
}
