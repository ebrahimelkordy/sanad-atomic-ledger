// src/domain/policies/auto-coa-inference.policy.ts
export class AutoCoaInferencePolicy {
  static resolve(context: {
    source: 'SALE_CASH'|'SALE_CREDIT'|'SALE_PAYMENT'|'PAYROLL'|'PAYROLL_TAX'|'PAYROLL_INSURANCE'|'INVENTORY_PURCHASE'|'SUPPLIER_PAYMENT'|'MANUAL'|'LEDGER';
    tenantStandard?: 'EGYPT_GAAP';
  }): {
    debitAccountCode: string;   // e.g. "1.1.1" (صندوق)
    creditAccountCode: string;  // e.g. "4.1.1" (مبيعات نقدية)
    partyType: 'CUSTOMER'|'SUPPLIER'|'EMPLOYEE'|'GENERAL'|'TAX'|'INSURANCE';
  } {
    // تنطبق معايير GAAP المصرية الافتراضية — لكنها قابلة للإستبدال policy تانية
    switch (context.source) {
      case 'SALE_CASH':    return { debitAccountCode: '1.1.1', creditAccountCode: '4.1.1', partyType: 'CUSTOMER' };
      case 'SALE_CREDIT':  return { debitAccountCode: '1.1.3', creditAccountCode: '4.1.2', partyType: 'CUSTOMER' };
      case 'SALE_PAYMENT': return { debitAccountCode: '1.1.1', creditAccountCode: '1.1.3', partyType: 'CUSTOMER' };
      case 'PAYROLL':      return { debitAccountCode: '5.2.1', creditAccountCode: '1.1.1', partyType: 'EMPLOYEE' };
      case 'PAYROLL_TAX':  return { debitAccountCode: '5.2.1', creditAccountCode: '2.2.1', partyType: 'TAX' };
      case 'PAYROLL_INSURANCE': return { debitAccountCode: '5.2.1', creditAccountCode: '2.2.2', partyType: 'INSURANCE' };
      case 'INVENTORY_PURCHASE': return { debitAccountCode: '1.1.4', creditAccountCode: '2.1.1', partyType: 'SUPPLIER' };
      case 'SUPPLIER_PAYMENT':   return { debitAccountCode: '2.1.1', creditAccountCode: '1.1.1', partyType: 'SUPPLIER' };
      default: return { debitAccountCode: '1.1.1', creditAccountCode: '5.9.9', partyType: 'GENERAL' };
    }
  }
}