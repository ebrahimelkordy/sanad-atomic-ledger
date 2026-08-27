# الخطوات من 2 إلى 9 — بأعلى معايير هندسية معمارية (Engineering Excellence)

> الـ Status للخطوات 0 و1: ✅ مكتملين بعد الإصلاح المعماري
> الحاكم العام: Clean Architecture + Ports & Adapters + DDD + Cross-Cutting Concerns عالمية + Outbox Pattern
> لا يوجد `any` / `!` / `Enum` لأعمال تجارية بدون مبرر.

---

## 🧱 المبادئ الهندسية التي يُبنى عليها كل خطوة

```
┌───────────────────────────────────────────────────────────┐
│                     Presentation Layer                     │
│  Controllers / GraphQL / WhatsApp Webhook / CLI          │
│  → تتحول إلى Commands/Queries وتمرر لـ Application       │
└────────────────────────┬──────────────────────────────────┘
                         │
┌────────────────────────▼──────────────────────────────────┐
│                    Application Layer                       │
│  Use Cases (Services): CreateSale / RunPayroll / ...     │
│  يعتمد على Ports (Interfaces) فقط — لا Prisma ولا HTTP   │
│  @Transactional() boundary per Use Case                  │
│  يصدر Domain Events ويكتبها قبل الـ Commit               │
└────────────────────────┬──────────────────────────────────┘
                         │
┌────────────────────────▼──────────────────────────────────┐
│                    Domain Layer (Core)                     │
│  Aggregates: Sale, LedgerEntry, InventoryBatch            │
│  Repository Interfaces (Ports): ISaleRepository, ...     │
│  Domain Policies: FIFO Allocation / Tax Brackets         │
└────────────────────────┬──────────────────────────────────┘
                         │
┌────────────────────────▼──────────────────────────────────┐
│                  Infrastructure (Adapters)                 │
│  PrismaSaleRepository implements ISaleRepository          │
│  BaileysGateway implements IMessageBus                    │
│  BullMQAdapter implements IBackgroundJobProcessor         │
└───────────────────────────────────────────────────────────┘
```

**Cross-Cutting Concerns = Global Guards/Interceptors/Pipes لا يُستدعون يدويًا:**
- 🔒 `PermissionGuard` (عالمي) — يقرأ `@RequirePermission()` من الـ Controller
- 📝 `AuditInterceptor` (عالمي) — يلتقِط كل `POST/PUT/DELETE` ويكتب `AuditLog` تلقائيًا
- 📅 `PeriodLockGuard` (عالمي) — يرفض أي كتابة على فترة مغلقة غير لـ Owner
- ✅ `ZodValidationPipe` (عالمي) — يتحقق من كل DTO قبل أن يلمس Application
- 🔄 `TransactionalInterceptor` — يفتح ويغلق الـ Transaction حول كل Use Case
- 🐛 `SentryExceptionFilter` — يلتقط كل Exceptions ويُكتبها للـ Audit/Logs

---

## 🏗️ الخطوة 2 (Architecturally Correct): تنبيهات المخزون التلقائية + Outbox

**الهدف النهائي المعماري:**
- لا يتم إرسال رسالة واتساب من داخل الـ Transaction أو من داخل الـ Job نفسها مباشرة.
- الـ Job = يكتشف الشرط → يكتب Event → يولد `OutboxMessage` → Consumer منفصل يرسل ويحدد الحالة.

**الملفات المطلوبة (7 ملفات = Clean Architecture كاملة):**

### 1/7 — Domain Policy: `src/domain/policies/inventory-alerts.policy.ts`
```typescript
export interface LowStockAlert { productId: string; sku: string; name: string; current: number; threshold: number; reorder?: number; }
export interface ExpiryAlert   { productId: string; sku: string; name: string; qty: number; expiryDate: Date; critical: boolean; }

export class InventoryAlertsPolicy {
  static detectLowStock(products: Array<{ id: string; sku: string; name: string; current_stock: number; low_stock_threshold: number | null; reorder_quantity: number | null; }>): LowStockAlert[] {
    return products
      .filter((p) => p.low_stock_threshold != null && p.current_stock <= p.low_stock_threshold)
      .map((p) => ({ productId: p.id, sku: p.sku, name: p.name, current: p.current_stock, threshold: p.low_stock_threshold!, reorder: p.reorder_quantity ?? undefined }));
  }

  static detectExpiry(batches: Array<{ id: string; product_id: string; product?: { name: string; sku: string } | null; quantity_remaining: number; expiry_date: Date | null; received_date: Date; }>, now = new Date()): ExpiryAlert[] {
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in7  = new Date(now.getTime() +  7 * 24 * 60 * 60 * 1000);
    return batches
      .filter((b) => b.quantity_remaining > 0 && b.expiry_date && b.expiry_date >= now && b.expiry_date <= in30)
      .sort((a, b) => a.expiry_date!.getTime() - b.expiry_date!.getTime())
      .map((b) => ({ productId: b.product_id, sku: b.product?.sku ?? '', name: b.product?.name ?? '', qty: b.quantity_remaining, expiryDate: b.expiry_date!, critical: b.expiry_date! <= in7 }));
  }
}
```

### 2/7 — Port: `src/application/ports/i-inventory-query.port.ts`
```typescript
export interface InventorySummaryRow { id: string; sku: string; name: string; current_stock: number; low_stock_threshold: number | null; reorder_quantity: number | null; }
export interface InventoryBatchRow    { id: string; product_id: string; quantity_remaining: number; expiry_date: Date | null; received_date: Date; product?: { name: string; sku: string } | null; }

export interface IInventoryQueryPort {
  findAllProductsByTenant(tenantId: string): Promise<InventorySummaryRow[]>;
  findExpiringBatches(tenantId: string, from: Date, toInclusive: Date): Promise<InventoryBatchRow[]>;
  findWhatsAppRecipients(tenantId: string, role: 'AUTHORIZED_FINANCE' | 'PUBLIC_SALES'): Promise<string[]>;
}
```

### 3/7 — Port: `src/application/ports/i-outbox-writer.port.ts`
```typescript
export type OutboxPayload = { to: string; body: string; priority?: 0|1|2; correlation_id?: string; };
export interface IOutboxWriterPort {
  enqueueWhatsAppText(tenantId: string, payload: OutboxPayload): Promise<string>;
}
```

### 4/7 — Use Case (Application Layer): `src/application/use-cases/generate-inventory-alerts.usecase.ts`
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { IInventoryQueryPort } from '../ports/i-inventory-query.port';
import { IOutboxWriterPort } from '../ports/i-outbox-writer.port';
import { InventoryAlertsPolicy, LowStockAlert, ExpiryAlert } from '../../domain/policies/inventory-alerts.policy';

@Injectable()
export class GenerateInventoryAlertsUseCase {
  private readonly logger = new Logger(GenerateInventoryAlertsUseCase.name);

  constructor(
    private readonly query: IInventoryQueryPort,
    private readonly outbox: IOutboxWriterPort,
  ) {}

  /** يقوم هذا الـ Use Case بجولة على كل Tenants وينتج تنبيهات في الـ Outbox. */
  async executeForAllTenants(tenantIds: string[]): Promise<{ tenantId: string; queued: number }[]> {
    const results = [];
    for (const tenantId of tenantIds) results.push(await this.execute(tenantId));
    return results;
  }

  async execute(tenantId: string): Promise<{ tenantId: string; queued: number }> {
    const [products, batches, recipients] = await Promise.all([
      this.query.findAllProductsByTenant(tenantId),
      this.query.findExpiringBatches(tenantId, new Date(), new Date(Date.now() + 30*24*60*60*1000)),
      this.query.findWhatsAppRecipients(tenantId, 'AUTHORIZED_FINANCE'),
    ]);
    const low = InventoryAlertsPolicy.detectLowStock(products);
    const exp = InventoryAlertsPolicy.detectExpiry(batches);
    if (low.length === 0 && exp.length === 0) return { tenantId, queued: 0 };

    const body = this.formatMessage(low, exp);
    let queued = 0;
    for (const phone of recipients) {
      await this.outbox.enqueueWhatsAppText(tenantId, { to: phone, body, priority: exp.some(e=>e.critical) ? 2 : 1, correlation_id: `inv-alert-${tenantId}-${Date.now()}` });
      queued++;
    }
    this.logger.log(`Tenant ${tenantId}: queued ${queued} inventory alert messages (low=${low.length}, expiring=${exp.length})`);
    return { tenantId, queued };
  }

  private formatMessage(low: LowStockAlert[], exp: ExpiryAlert[]): string {
    const lines: string[] = [`🚨 تنبيهات المخزون التلقائية — نظام سند`, `تاريخ: ${new Date().toLocaleString('ar-EG')}`, ''];
    if (low.length) {
      lines.push('━━━━━━━━━━━━━━━━━━━━');
      lines.push(`📦 المنتجات تحت الحد الأدنى (${low.length} صنف):`);
      for (const p of low.slice(0,30)) lines.push(`• ${p.name} (${p.sku}) — المتاح: ${p.current} | الحد: ${p.threshold}${p.reorder ? ` | إعادة طلب مقترحة: ${p.reorder}` : ''}`);
      if (low.length > 30) lines.push(`  و ${low.length-30} صنف آخر...`);
      lines.push('');
    }
    const crit = exp.filter(e=>e.critical), norm = exp.filter(e=>!e.critical);
    if (crit.length) { lines.push('━━━━━━━━━━━━━━━━━━━━'); lines.push(`🔴 منتجات ستنتهي خلال 7 أيام (${crit.length}):`); for (const b of crit) lines.push(`• ${b.name} — الكمية: ${b.qty} — تاريخ: ${b.expiryDate.toISOString().slice(0,10)}`); lines.push(''); }
    if (norm.length) { lines.push('━━━━━━━━━━━━━━━━━━━━'); lines.push(`🟡 منتجات ستنتهي خلال 8-30 يوم (${norm.length}):`); for (const b of norm.slice(0,20)) lines.push(`• ${b.name} — الكمية: ${b.qty} — تاريخ: ${b.expiryDate.toISOString().slice(0,10)}`); lines.push(''); }
    lines.push('━━━━━━━━━━━━━━━━━━━━'); lines.push('توليد تلقائي — نظام سند v1');
    return lines.join('\n');
  }
}
```

### 5/7 — Prisma Adapter للمنافذ (Infrastructure): `src/infrastructure/adapters/prisma-inventory-query.adapter.ts`
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../repositories/prisma.service';
import { IInventoryQueryPort, InventorySummaryRow, InventoryBatchRow } from '../../application/ports/i-inventory-query.port';

@Injectable()
export class PrismaInventoryQueryAdapter implements IInventoryQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findAllProductsByTenant(tenantId: string): Promise<InventorySummaryRow[]> {
    return this.prisma.inventoryProduct.findMany({
      where: { tenant_id: tenantId, is_active: true },
      select: { id: true, sku: true, name: true, current_stock: true, low_stock_threshold: true, reorder_quantity: true },
    });
  }

  async findExpiringBatches(tenantId: string, from: Date, toInclusive: Date): Promise<InventoryBatchRow[]> {
    return this.prisma.inventoryStockBatch.findMany({
      where: { tenant_id: tenantId, quantity_remaining: { gt: 0 }, expiry_date: { gte: from, lte: toInclusive } },
      orderBy: { expiry_date: 'asc' },
      include: { product: { select: { name: true, sku: true } } },
    });
  }

  async findWhatsAppRecipients(tenantId: string, role: 'AUTHORIZED_FINANCE' | 'PUBLIC_SALES'): Promise<string[]> {
    const rows = await this.prisma.tenantWhatsAppNumber.findMany({
      where: { tenant_id: tenantId, number_role: role },
      select: { phone_number: true },
    });
    return rows.map(r => r.phone_number).filter(Boolean);
  }
}
```

### 6/7 — Prisma Outbox Adapter: `src/infrastructure/adapters/prisma-outbox-writer.adapter.ts`
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../repositories/prisma.service';
import { IOutboxWriterPort, OutboxPayload } from '../../application/ports/i-outbox-writer.port';

@Injectable()
export class PrismaOutboxWriterAdapter implements IOutboxWriterPort {
  constructor(private readonly prisma: PrismaService) {}

  async enqueueWhatsAppText(tenantId: string, payload: OutboxPayload): Promise<string> {
    const row = await this.prisma.outboxMessage.create({
      data: {
        tenant_id: tenantId,
        message_type: 'WHATSAPP_TEXT',
        payload: { to: payload.to, body: payload.body } as any,
        priority: payload.priority ?? 0,
        correlation_id: payload.correlation_id ?? null,
        status: 'PENDING',
      },
      select: { id: true },
    });
    return row.id;
  }
}
```

### 7/7 — الدورة الزمنية (Trigger): `src/jobs/inventory-alerts.job.ts` (باستخدام BullMQ أو @nestjs/schedule)
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../repositories/prisma.service';
import { GenerateInventoryAlertsUseCase } from '../application/use-cases/generate-inventory-alerts.usecase';

@Injectable()
export class InventoryAlertsJob {
  private readonly logger = new Logger(InventoryAlertsJob.name);
  constructor(private readonly prisma: PrismaService, private readonly usecase: GenerateInventoryAlertsUseCase) {}

  @Cron(CronExpression.EVERY_6_HOURS, { name: 'inventory-alerts' })
  async run() {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    this.logger.log(`Running inventory alerts sweep for ${tenants.length} tenants`);
    await this.usecase.executeForAllTenants(tenants.map(t => t.id));
  }
}
```

---

## 🏗️ الخطوة 3: دليل الحسابات الشجري + Auto-Posting Rules

**Architectural Target:**
- كل شركة لها دليل حساباتها الخاص (per-tenant)
- هيكل شجري `materialized path` (codes 1, 1.1, 1.1.1)
- الـ `LedgerEntry` يرتبط بـ `coa_id` صريح ولا يُحسب من enum
- Default Seed للـ COA الافتراضي المصري عند إنشاء Tenant الجديد

**الملفات المطلوبة (4 ملفات):**

1. `src/domain/aggregates/chart-of-account.aggregate.ts` (المفاهيم والـ Invariants)
2. `src/application/ports/i-coa.port.ts` (Interface)
3. `src/infrastructure/adapters/prisma-coa.adapter.ts` (Implementation)
4. `src/domain/policies/auto-coa-inference.policy.ts` (قواعد الاستنتاج المحاسبي لكل حركة):
```typescript
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
```

---

## 🏗️ الخطوة 4: FIFO Stock Allocation + Domain Events

**Architectural Target:**
- خصم المخزون يُنفذ كـ Domain Policy محض (Unit-Testable بدون Database)
- Aggregate `InventoryProduct` يحافظ على Invariant: `SUM(Batch.qty) == current_stock`
- يُصدر `InventoryWithdrawnEvent` وينقله إلى `Outbox` تلقائيًا

**الملفات المطلوبة (5 ملفات):**

1. **Domain Policy** `src/domain/policies/fifo-allocation.policy.ts`
```typescript
export interface AllocatableBatch { id: string; expiry_date: Date | null; received_date: Date; quantity_remaining: number; cost_per_unit: number; }
export interface AllocationResult { batchId: string; taken: number; unitCost: number; }

export class FifoAllocationPolicy {
  static allocate(batches: AllocatableBatch[], requiredQty: number): {
    success: boolean; allocated: AllocationResult[]; totalCost: number; reason?: string;
  } {
    // ترتيب FIFO الصارم مع وضع الـ batches بلا expiry_date في النهاية
    const withExp   = batches.filter(b => b.expiry_date != null).sort((a,b) => a.expiry_date!.getTime() - b.expiry_date!.getTime() || a.received_date.getTime() - b.received_date.getTime());
    const noExpiry  = batches.filter(b => b.expiry_date == null).sort((a,b) => a.received_date.getTime() - b.received_date.getTime());
    const sorted = [...withExp, ...noExpiry];

    let needed = requiredQty;
    const allocated: AllocationResult[] = [];
    let totalCost = 0;
    for (const b of sorted) {
      if (needed <= 0) break;
      if (b.quantity_remaining <= 0) continue;
      const take = Math.min(b.quantity_remaining, needed);
      allocated.push({ batchId: b.id, taken: take, unitCost: b.cost_per_unit });
      totalCost += take * b.cost_per_unit;
      needed -= take;
    }

    if (needed > 0) return { success: false, allocated, totalCost, reason: `INSUFFICIENT_BATCHES: need ${requiredQty} but available is ${requiredQty - needed}` };
    return { success: true, allocated, totalCost };
  }
}
```

2. **Port:** `src/application/ports/i-inventory-stock.port.ts`
3. **Use Case:** `src/application/use-cases/withdraw-inventory.usecase.ts` — يُطبق الـ Policy داخل Transaction، وينتج `InventoryWithdrawnEvent`، ويحافظ على Invariant الـ stock.
4. **Adapter:** `src/infrastructure/adapters/prisma-inventory-stock.adapter.ts`
5. **Interceptor:** `@Transactional()` يُجبر كل الـ operations داخل نفس الـ Prisma Transaction.

---

## 🏗️ الخطوة 5: دورة الفواتير + Dunning (التذكيرات المعيارية)

**Architectural Target:**
- State Machine واضح للفاتورة: `DRAFT → ISSUED → (REMIND_3D) → (DUE_DAY) → OVERDUE_L1 → OVERDUE_L2 → PAID / CANCELLED`
- Dunning = استراتيجية قابلة للإستبدال (Policy) وليس if-else صلبة
- إصدار الفواتير = يولد Event → Outbox (لا يرسل مباشرة)

**الملفات المطلوبة (5):**
1. `src/domain/aggregates/sale-lifecycle.state-machine.ts` (State pattern)
2. `src/domain/policies/dunning-strategy.policy.ts` (الإستراتيجية الافتراضية: 3 أيام + يوم الاستحقاق + كل 5 أيام)
3. `src/application/use-cases/issue-invoice.usecase.ts`
4. `src/application/use-cases/process-dunning.usecase.ts` (يبدأ يوميًا الساعة 9)
5. `src/jobs/dunning.job.ts` (Trigger)

---

## 🏗️ الخطوة 6: الرواتب + الضرائب + التأمينات

**Architectural Target:**
- سياسات الضريبة والتأمينات = Policies قابلة للإستبدال، ولا تُكتب كأرقام صلبة في الـ UseCase.
- تشغيل الرواتب يُنتج: EmployeeTransactions (PAYROLL_PAYMENT) + LedgerEntries مرتبطة بـ COA الصحيح + DomainEvent + Outbox بتقارير كشوف المرتبات لكل موظف.
- `tenant.payroll_last_run_month` يمنع إعادة التشغيل بنفس الفترة (Invariant يُنفذ في Domain Aggregate وليس في Service).

**الملفات المطلوبة (6):**
1. `src/domain/policies/egypt-payroll-brackets.policy.ts` (سلم الضريبة 2024 + التأمينات 11%/18.75% + سقف 14,000)
2. `src/domain/policies/attendance-earning.policy.ts` (حساب الـ earned من الحضور + العمل الإضافي)
3. `src/application/ports/i-payroll.port.ts`
4. `src/application/use-cases/run-monthly-payroll.usecase.ts`
5. `src/application/ports/i-ledger-writer.port.ts` (كتابة القيود المحاسبية بوصفها Posting Batches — مُجمعة وليست مفردة)
6. Endpoint `POST /payroll/run` محمي بـ `@RequirePermission('payroll:run')`

---

## 🏗️ الخطوة 7: التقارير المالية التلقائية الشهرية

**Architectural Target:**
- بناء التقرير = Query Engine منفصل (CQS صارم — لا يلمس الموديلات المكتوبة)
- التقرير لا يُرسل مباشرة → يولد OutboxMessage نوع `WHATSAPP_PDF/TEXT` priority=2
- كل الـ financial aggregates (P&L, Aging, Cash) = Views / Materialized Views لو زادت البيانات لاحقًا.

**الملفات المطلوبة (5):**
1. `src/application/queries/financial-monthly-report.query-handler.ts` (CQS Query Handler صارم)
2. `src/application/ports/i-financial-reporting.port.ts` (أجراس الـ groupings)
3. `src/infrastructure/adapters/prisma-financial-reporting.adapter.ts` (Prisma.groupBy)
4. `src/application/use-cases/queue-monthly-report.usecase.ts` (1 من كل شهر الساعة 7 صباحًا)
5. `src/jobs/monthly-financial-report.job.ts` (Trigger + توزيع Tenants)

---

## 🏗️ الخطوة 8: الموردين + دورة الشراء (Purchases)

**Architectural Target:**
- PurchaseInvoice يصدر StockReceivedEvent → يضيف Batches ويربطها بالمورد (Invariant: supplier balance increases by unpaid amount)
- Supplier Ledger = مرتبط بـ COA `2.1.1` (الذمم الدائنة للموردين) بشكل تلقائي
- كل عملية شراء = مجموعة Ledger Posting Batches (مجمعة عشان الـ Atomicity)

**الملفات المطلوبة (5):**
1. `src/domain/aggregates/purchase-invoice.aggregate.ts`
2. `src/application/use-cases/create-purchase-invoice.usecase.ts`
3. `src/application/use-cases/pay-supplier.usecase.ts`
4. Endpoints Suppliers محمية بـ `@RequirePermission('supplier:*')`
5. Supplier Aging Report (30/60/90 يوم) + Period Lock

---

## 🏗️ الخطوة 9: الإغلاق المالي (Period Close) + Integrity

**Architectural Target:**
- Period Lock = **Guard عالمي**، لا يدوي. أي كتابة على تاريخ < tenant.closed_until_date → ترفض تلقائيًا (باستثناء `OWNER` Permission).
- فتح فترة مرة أخرى = يتطلب صلاحية خاصة `finance.period:reopen` ويكتب `AuditLog` دقيقًا.
- الـ Close Period Procedure = يُجري validations قبل الإغلاق:
  1. هل هناك Pending Settlements معطلة؟
  2. هل الفروق في Ledger vs Control Accounts صفر؟
  3. هل الجرد دوري للمخزون مطابق لـ Books؟

**الملفات المطلوبة (4):**
1. **Global Guard:** `src/guards/period-lock.guard.ts` (يُعطّل فعليًا كل Write قبل تاريخ الإغلاق)
2. **Use Case:** `src/application/use-cases/close-financial-period.usecase.ts`
3. **Validation Suite:** `src/domain/policies/period-close-preflight.policy.ts`
4. Endpoint `POST /finance/period/close` محمي بـ `@RequirePermission('finance.period:close')`

---

## 🔁 Cross-Cutting Concerns — ملفات عالمية مُطبقة لمرة واحدة

### 1. Permission Guard (`src/guards/permission.guard.ts` — Global)
```typescript
@Injectable()
export class PermissionGuard implements CanActivate {
  // يعتمد على User → Roles → RolePermissions (DB JOIN)
  // استخدم Memoization عشان كل request ما يعملش نفس الـ JOIN كل مرة
}
// Decorator: export const RequirePermission = (resource: string, action: string) => SetMetadata('permission', `${resource}:${action}`);
```

### 2. Audit Interceptor (`src/interceptors/audit.interceptor.ts` — Global)
```typescript
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // يلتقط POST/PUT/PATCH/DELETE
    // يقرأ request.user, request.body, response body
    // يكتب AuditLog بعد نجاح الـ Operation
  }
}
```

### 3. Transactional Interceptor (`src/interceptors/transactional.interceptor.ts`)
```typescript
// Decorator: @Transactional()
// يفتح prisma.$transaction ويمرر txClient عبر AsyncLocalStorage
// يلتقط Error ويعمل rollback تلقائيًا
```

---

## 🗓️ ترتيب التنفيذ العملي (بالجهد الفعلي)

| اليوم | الخطوة | الوقت المتوقع |
|---|---|---|
| اليوم 1 (صباحًا) | Infrastructure Base → Ports/Adapters + Cross-Cutting (3 Global Guards/Interceptors) | 120 دقيقة |
| اليوم 1 (مساءً) | الخطوة 2 (تنبيهات المخزون) كاملة + Job | 90 دقيقة |
| اليوم 2 (صباحًا) | الخطوة 3 (COA) + الخطوة 4 (FIFO Allocation) | 150 دقيقة |
| اليوم 2 (مساءً) | الخطوة 9 (Period Lock + Close Guard) | 60 دقيقة |
| اليوم 3 (صباحًا) | الخطوة 5 (دورة الفواتير + Dunning) | 120 دقيقة |
| اليوم 3 (مساءً) | الخطوة 8 (الموردين + المشتريات) | 120 دقيقة |
| اليوم 4 (صباحًا) | الخطوة 7 (التقارير المالية) | 90 دقيقة |
| اليوم 4 (مساءً) | الخطوة 6 (الرواتب + الضرائب) | 150 دقيقة |

**الإجمالي:** ~17 ساعة عمل صافية — مقسمة على 4 أيام عمل عادية مع فترات راحة.

---

## ✅ نتيجة القبول المعمارية النهائية

كل خطوة تعتبر مكتملة **فقط إذا تحققت الشروط التالية ALL:**
| # | المعيار |
|---|---|
| 1 | `import { PrismaService }` غير موجود في أي ملف داخل مجلد `/src/application` أو `/src/domain` |
| 2 | كل DTO (المدخلات) مرتبط بـ `z.object(...)` محقق عبر Global `ZodValidationPipe` |
| 3 | كل إرسال واتساب/تقرير → يذهب إلى `outbox_messages` أولاً — لا يصدر مباشرة من Use Case |
| 4 | لا يوجد `RoleGuard` قديم أو `enum SystemRole` يستخدم في أي Controller — تم استبداله بـ `@RequirePermission()` |
| 5 | الـ `LedgerEntry` الجديد يحتوي دائمًا على `coa_id` صالح مرتبط بجدول `ChartOfAccount` (غير null للقيود الجديدة) |
| 6 | Period Lock Guard يرفض محاولة كتابة على فترة مغلقة بصلاحية غير OWNER → اختبار Integration يمر |
| 7 | Build = صفر أخطاء TS + صفر ESLint warnings (rules strict) |
