import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerRepository, CreateCustomerInput } from '../repositories/customer.repository';
import { SaleRepository } from '../repositories/sale.repository';
import { FinanceQueryService } from './finance-query.service';

@Injectable()
export class CustomerService {
  constructor(
    private readonly customerRepository: CustomerRepository,
    private readonly saleRepository: SaleRepository,
    private readonly financeQueryService: FinanceQueryService,
  ) {}

  async getCustomers(tenantId: string) {
    const customers = await this.customerRepository.findByTenantId(tenantId);
    const ledgerSummaries = await this.financeQueryService.getSummary(tenantId);
    const summaryMap = new Map<string, any>();
    ledgerSummaries.forEach((s: any) => summaryMap.set(s.party_identifier, s));

    return customers.map((c) => {
      const summary = summaryMap.get(c.phone) || summaryMap.get(c.name) || {};
      const balance = Number(summary.running_balance || 0);
      return {
        ...c,
        balance,
        outstanding_debt: Math.max(0, -balance),
        credit_balance: Math.max(0, balance),
      };
    });
  }

  async getCustomerById(tenantId: string, id: string) {
    const customer = await this.customerRepository.findById(tenantId, id);
    if (!customer) throw new NotFoundException('العميل غير موجود');

    // جلب جميع فواتير مبيعات العميل
    const sales = await this.saleRepository.findByTenantId(tenantId);
    const customerSales = sales.filter(
      (s) => s.customer_identifier === customer.phone || s.customer_identifier === customer.name,
    );

    // جلب كشف الحساب من الـ Ledger
    const ledger = await this.financeQueryService.getLedger(tenantId, customer.phone);
    const summaryList = await this.financeQueryService.getSummary(tenantId, customer.phone);
    const summary = summaryList[0] || {};
    const balance = Number(summary.running_balance || 0);

    return {
      ...customer,
      balance,
      outstanding_debt: Math.max(0, -balance),
      credit_balance: Math.max(0, balance),
      sales: customerSales,
      ledger_entries: ledger,
    };
  }

  async createCustomer(tenantId: string, dto: Omit<CreateCustomerInput, 'tenant_id'>) {
    return this.customerRepository.createCustomer({
      tenant_id: tenantId,
      ...dto,
    });
  }
}
