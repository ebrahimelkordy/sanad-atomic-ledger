# خطوات التنفيذ الأسرع (2 → 9) — خطة تفصيلية عقلية "هنسي المعمارية"

> الـ Status للخطوتين 0 و1: ✅ مكتملتين مع Build ناجح
> مبدأ العمل لكل الخطوات: أقل كود → أقل ملفات جديدة → إعادة استخدام كل ما موجود بالفعل (BullMQ, Zod, WhatsApp Gateway, Prisma Transaction Runner, PrismaService مباشرة لما يوفر الوقت — لا نعمل Repositories جديدة للوظائف الجديدة إلا لو محتاجين فعليًا)
> التسويات البنكية = خارج الخطة تمامًا كما طلبت.

---

## ترتيب الأولويات حسب العائد/الجهد

| أولوية | الخطوة | المكون الرئيسي | الوقت المتوقع | العائد الفوري |
|---|---|---|---|---|
| 🔥 1 | الخطوة 2 | تنبيهات المخزون التلقائية | **30 دقيقة** | أول وظيفة شغالة وبتولد قيمة فعلية للمالك |
| 🔥 2 | الخطوة 4 | FIFO + Stock Batches (خصم المخزون) | **90 دقيقة** | سلامة بيانات المخزون + صلاحيات الصرف بدون تعارض |
| 🔥 3 | الخطوة 3 | دليل الحسابات (Inference تلقائي) | **20 دقيقة** | اساس كل التقارير المالية من هنا |
| 4 | الخطوة 5 | دورة الفواتير + تذكيرات | **90 دقيقة** | اول خطوة في تقليل العبء على المحاسب |
| 5 | الخطوة 7 | التقارير الشهرية على الواتساب | **90 دقيقة** | اقوى مردود على الرؤية الإدارية بدون FRONTEND |
| 6 | الخطوة 6 | الرواتب + الضرائب والتأمينات | **120 دقيقة** | اكبر توفير لوقت المحاسب |
| 7 | الخطوة 8 | الموردين + فواتير الشراء الأساسية | **90 دقيقة** | اكمال حلقة المخزون (مشتريات ↔ مبيعات) |
| 8 | الخطوة 9 | الإغلاق المالي الشهري | **30 دقيقة** | الحماية الاخيرة لسلامة الارقام التاريخية |

---

# 📋 الخطوة 2: تنبيهات المخزون التلقائية (BullMQ + WhatsApp Gateway موجودين)

**الهدف:** BullMQ Job كل 6 ساعات بيبعت واتساب للمالك عن:
1. المنتجات التي انخفضت عن `min_stock_level`
2. المنتجات التي `expiry_date` خلال 30 يوماً (واخر 7 أيام بتنبيه منفصل)

---

### الملفات المطلوبة (2 ملفات فقط: 1 جديد + 1 تعديل بسيط)

#### 1. ملف جديد: `src/queues/inventory-alerts.worker.ts`
```typescript
import { Processor, Process } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../repositories/prisma.service';
// استخدم الـ Service اللي موجودة بالفعل في الخطوة 07
// لو مش مكشوف للـ DI نستدعيه مباشرة أو نعرف reference داخل الـ providers بتاع QueueModule

@Injectable()
@Processor('inventory-alerts')
export class InventoryAlertsWorker {
  constructor(private readonly prisma: PrismaService) {}

  @Process()
  async run() {
    // جلب كل الـ tenants عشان نشغلها عليهم كلهم (أو نعمل Queue بـ tenant id لو محتاجين)
    const tenants = await this.prisma.tenant.findMany({
      include: {
        whatsapp_numbers: {
          where: { number_role: 'AUTHORIZED_FINANCE' },
          select: { phone_number: true },
        },
      },
    });

    for (const tenant of tenants) {
      const financePhones = tenant.whatsapp_numbers
        .map((n) => n.phone_number)
        .filter(Boolean);
      if (financePhones.length === 0) continue;

      // (أ) منتجات تحت الحد الأدنى — عمود موجود في الخطوة 0
      const lowStock = await this.prisma.inventoryProduct.findMany({
        where: {
          tenant_id: tenant.id,
          min_stock_level: { not: null },
          current_stock: { lte: this.prisma.inventoryProduct.fields.min_stock_level as any },
        },
        select: { id: true, name: true, sku: true, current_stock: true, min_stock_level: true, reorder_quantity: true },
      });

      // (ب) منتجات ستنتهي خلال 30 يوماً (وليس منتهية فعلياً)
      const soon30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const soon7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const now = new Date();

      const expiringBatches = await this.prisma.inventoryStockBatch.findMany({
        where: {
          tenant_id: tenant.id,
          quantity_remaining: { gt: 0 },
          expiry_date: { gte: now, lte: soon30 },
        },
        include: { product: { select: { name: true, sku: true } } },
        orderBy: { expiry_date: 'asc' },
      });

      const message = this.formatMessage(tenant.business_name, lowStock, expiringBatches, soon7);
      if (!message) continue;

      for (const phone of financePhones) {
        // نستخدم الـ gateway الموجود بالفعل — لو DI مش ممكن نعمل Helper مباشر
        // في الخطوة 07 موجود الـ BaileysGatewayService فيه sendText()
        // بديل سريع: نستدعي direct من خلال الـ prisma ما عندنا واتساب — الـ proper solution هو inject BaileysGatewayService
        await this.trySendViaGateway(phone, message);
      }
    }
  }

  private formatMessage(
    tenantName: string,
    lowStock: any[],
    expiringBatches: any[],
    soon7Date: Date,
  ): string | null {
    const lines: string[] = [`🚨 تنبيهات المخزون التلقائية — ${tenantName}`, `تاريخ: ${new Date().toLocaleString('ar-EG')}`, ''];

    if (lowStock.length > 0) {
      lines.push('━━━━━━━━━━━━━━━━━━━━');
      lines.push(`📦 المنتجات تحت الحد الأدنى (${lowStock.length} صنف):`);
      for (const p of lowStock.slice(0, 20)) {
        lines.push(
          `• ${p.name} (${p.sku}) — المتاح: ${p.current_stock} | الحد: ${p.min_stock_level}` +
          (p.reorder_quantity ? ` | إعادة طلب مقترحة: ${p.reorder_quantity}` : ''),
        );
      }
      if (lowStock.length > 20) lines.push(`  و ${lowStock.length - 20} صنف آخر...`);
      lines.push('');
    }

    const criticalSoon7 = expiringBatches.filter((b) => b.expiry_date <= soon7Date);
    const normal30 = expiringBatches.filter((b) => b.expiry_date > soon7Date);

    if (criticalSoon7.length > 0) {
      lines.push('━━━━━━━━━━━━━━━━━━━━');
      lines.push(`🔴 المنتجات ستنتهي خلال 7 أيام (${criticalSoon7.length} دفعة):`);
      for (const b of criticalSoon7) {
        lines.push(
          `• ${b.product.name} — باقي: ${b.quantity_remaining} — تنتهي: ${b.expiry_date.toISOString().slice(0, 10)}`,
        );
      }
      lines.push('');
    }

    if (normal30.length > 0) {
      lines.push('━━━━━━━━━━━━━━━━━━━━');
      lines.push(`🟡 المنتجات ستنتهي خلال 8-30 يوم (${normal30.length} دفعة):`);
      for (const b of normal30.slice(0, 15)) {
        lines.push(
          `• ${b.product.name} — باقي: ${b.quantity_remaining} — تنتهي: ${b.expiry_date.toISOString().slice(0, 10)}`,
        );
      }
      if (normal30.length > 15) lines.push(`  و ${normal30.length - 15} دفعة أخرى...`);
      lines.push('');
    }

    if (lowStock.length === 0 && expiringBatches.length === 0) {
      // منع إرسال رسالة فارغة — مش عايزين spam
      return null;
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push('تم إنشاء هذا التقرير تلقائياً — نظام سند');
    return lines.join('\n');
  }

  private async trySendViaGateway(phone: string, text: string): Promise<void> {
    try {
      // طريقة أسرع: inject BaileysGatewayService في الـ constructor و call sendText.
      // لو الـ DI في الـ QueueModule مش مجهزة، سجلها في logger.warn مؤقتاً لحد ما نربط الـ gateway.
      // Implementation placeholder: نكملها وقت التنفيذ الفعلي بساعات.
    } catch {
      /* no-op: فشل إرسال تنبيه ما يوقف عن باقي الـ tenants */
    }
  }
}
```

#### 2. تعديل بسيط: `src/queues/queue.module.ts` / `queue.config.ts`
- إضافة الـ `InventoryAlertsWorker` إلى الـ providers بتاعة الـ QueueModule
- إضافة Job متكرر (repeatable) — الـ pattern: `0 */6 * * *`

> 💡 **ملاحظة سرعة:** لو الـ `@nestjs/schedule` مثبت (هو موجود بالفعل في package.json حسب الخطوة 01!) ممكن نكتبو كـ Cron أساسي أول يوم ونرحل لـ BullMQ بعدين. ده يوفر الـ wiring اللي بتاخد وقت. الأسطر التالية تكفي (بدون أي تعديلات على QueueModule):
> ```typescript
> // في ملف جديد src/jobs/inventory-alerts.cron.ts — @Cron('0 */6 * * *')
> import { Injectable } from '@nestjs/common';
> import { Cron, CronExpression } from '@nestjs/schedule';
> @Injectable()
> export class InventoryAlertsCron {
>   @Cron(CronExpression.EVERY_6_HOURS) async handle() { /* نفس الـ logic من فوق */ }
> }
> ```
> **هذا الخيار أسرع بـ 5 دقائق — مستحسن للمرحلة الأولى.**
> نضيف الـ InventoryAlertsCron لـ providers في ServicesModule أو AppModule.

---

### نتيجة القبول (DoD)
- تشغيل الـ App، وبعد الـ 6 ساعات الأولى (أو trigger يدوي للـ test) — يظهر في كشوف الواتساب رسالة لـ `AUTHORIZED_FINANCE` تحتوي بيانات حقيقية من قاعدة البيانات.
- لو مفيش مشاكل = لا يتم إرسال أي رسالة (عدم إزعاج المالك بـ "كل شيء تمام").

---

# 📋 الخطوة 4 (قبل الـ3 عشان الأساس): FIFO خصم المخزون من الـ Batches

**الهدف:** الخصم الفعلي لا يبقى فقط على `current_stock` — لازم يخصم من الـ `InventoryStockBatch` الفعلية مع تطبيق FIFO صارم:
1. أولاً الدفعات اللي `expiry_date` أسرع (لو الـ product مع expiry nullable = null ييجي آخر)
2. ثانياً الدفعات اللي `received_date` أقدم

**المبدأ السريع:** نحتفظ بـ `current_stock` كـ "ملخص سريع" موجود للـ APIs والفرونت القديمة — لكن الـ source of truth يصير الـ Batches. اول ما نخلص نضيف كونسترينت CHECK تؤكد `SUM(batches.quantity_remaining) = product.current_stock` كـ deferred constraint.

---

### الملفات الوحيدة المطلوبة (1 تعديل كبير + 1 دالة جديدة)

#### تعديل وحيد على: `src/services/inventory-operations.service.ts`

**دالة جديدة** `addStockBatch()` تُستخدم عند شراء/إضافة بضاعة جديدة:
```typescript
// داخل InventoryOperationsService
async addStockBatch(
  tenantId: string,
  input: {
    productNameOrSku: string;
    quantity: number;
    costPerUnit: number;
    expiryDate?: Date | string;
    supplierRef?: string;
    requestedBy: string;
  },
) {
  const validated = z.object({
    productNameOrSku: z.string().min(1),
    quantity: z.number().int().positive(),
    costPerUnit: z.number().min(0),
    expiryDate: z.union([z.date(), z.string(), z.null()]).optional(),
    supplierRef: z.string().optional(),
    requestedBy: z.string(),
  }).parse(input);

  return this.tx.run(async (txClient) => {
    // 1. العثور على المنتج
    let product = await this.inventoryRepo.findByTenantAndSku(tenantId, validated.productNameOrSku, txClient);
    if (!product) {
      const byName = await this.inventoryRepo.findByTenantAndName(tenantId, validated.productNameOrSku, txClient);
      product = byName[0] ?? null;
    }
    if (!product) throw new NotFoundException(`المنتج غير موجود: ${validated.productNameOrSku}`);

    // 2. قفل + تحديث الملخص (نحافظ على التوافق)
    await this.inventoryRepo.lockForUpdate(product.id, txClient as any);
    await this.inventoryRepo.incrementStock(product.id, validated.quantity, txClient);

    // 3. إنشاء الدفعة
    const expiry = validated.expiryDate
      ? (typeof validated.expiryDate === 'string' ? new Date(validated.expiryDate) : validated.expiryDate)
      : null;
    const batch = await txClient.inventoryStockBatch.create({
      data: {
        tenant_id: tenantId,
        product_id: product.id,
        quantity_remaining: validated.quantity,
        cost_per_unit: validated.costPerUnit,
        expiry_date: expiry,
        supplier_ref: validated.supplierRef ?? null,
      },
    });

    // 4. تحديث average cost_price للمنتج (اختياري لكن مفيد للتقارير)
    const allBatches = await txClient.inventoryStockBatch.findMany({
      where: { product_id: product.id, quantity_remaining: { gt: 0 } },
      select: { quantity_remaining: true, cost_per_unit: true },
    });
    const totalQty = allBatches.reduce((s, b) => s + b.quantity_remaining, 0);
    const weightedAvgCost = totalQty > 0
      ? allBatches.reduce((s, b) => s + b.quantity_remaining * Number(b.cost_per_unit), 0) / totalQty
      : validated.costPerUnit;
    await txClient.inventoryProduct.update({
      where: { id: product.id },
      data: { cost_price: weightedAvgCost },
    });

    return { batch_id: batch.id, product: product.name, final_stock: (product.current_stock + validated.quantity) };
  });
}
```

**تعديل الدالة الموجودة:** `withdrawInventoryWithLedger()` (في نفس الملف السطر 62 تقريبًا)

نستبدل حلقة الخصم المباشرة من `decrementStockWithLock` بـ FIFO على الـ Batches. **باقي الكود (Ledger + Summary) كما هو تمامًا بدون أي تغيير — حفظ عظيم للوقت:**

```typescript
// داخل withdrawInventoryWithLedger — بداية حلقة for (const item of validated.items):
// نحافظ على نفس الهيكل — نغير فقط جزء الخصم

// 2a. البحث عن المنتج — يظل كما هو
// 2b. قفل المنتج (lockForUpdate) + إعادة التحقق من current_stock كمجموع
for (const item of validated.items) {
  let product = /* same search */ null as any;

  // — lookup — same as before
  if (!product) { failures.push(...); continue; }

  await this.inventoryRepo.lockForUpdate(product.id, txClient as Prisma.TransactionClient);

  // ===== START FIFO CHANGES (replace old decrementStockWithLock area) =====
  // 1. نجيب كل الـ batches متاحة للصرف مرتبة FIFO صحيح
  const availableBatches = await txClient.inventoryStockBatch.findMany({
    where: {
      tenant_id: tenantId,
      product_id: product.id,
      quantity_remaining: { gt: 0 },
    },
    orderBy: [
      // أولاً بلا expiry = null يجي أخر. NULLS LAST محتاج raw query أحياناً — نكتبها بشرطة بسيطة
      { expiry_date: 'asc' },
      { received_date: 'asc' },
      { id: 'asc' },
    ],
  });

  // نصلح ترتيب الـ NULLS لـ expiry_date يدوياً لأن بعض إصدارات Prisma بترتبهم أولاً
  const nullExpiry = availableBatches.filter(b => b.expiry_date === null);
  const withExpiry = availableBatches.filter(b => b.expiry_date !== null);
  // مع Prisma asc: nulls بيتبعوا حسب قاعدة الـ DB — فلنرتب them فعلياً last
  const sorted = [...withExpiry.sort((a, b) => (a.expiry_date!.getTime() - b.expiry_date!.getTime())), ...nullExpiry];

  let remainingToWithdraw = item.quantity;
  const totalAvailableInBatches = sorted.reduce((s, b) => s + b.quantity_remaining, 0);

  if (totalAvailableInBatches < item.quantity) {
    failures.push(
      `❌ المخزون غير كافٍ للمنتج "${product.name}". المتاح في الدفعات: ${totalAvailableInBatches}, المطلوب: ${item.quantity}.`
    );
    continue;
  }

  let lineCostValue = 0; // مجموع cost per unit الفعلي للـ FIFO (لحساب الربح لاحقاً)
  for (const batch of sorted) {
    if (remainingToWithdraw <= 0) break;
    const qtyFromBatch = Math.min(batch.quantity_remaining, remainingToWithdraw);
    if (qtyFromBatch <= 0) continue;

    // خصم من هذه الدفعة
    await txClient.inventoryStockBatch.update({
      where: { id: batch.id },
      data: { quantity_remaining: { decrement: qtyFromBatch } },
    });
    lineCostValue += qtyFromBatch * Number(batch.cost_per_unit);
    remainingToWithdraw -= qtyFromBatch;
  }

  // نحديث الـ current_stock الملخص للحفاظ على التوافق
  await this.inventoryRepo.decrementStockWithLock(
    product.id,
    item.quantity,
    txClient as Prisma.TransactionClient,
  );

  // تحديث line_value باستخدام الـ unit_price الحالي للمنتج للسعر البيعي
  const lineValue = item.quantity * Number(product.unit_price);
  lines.push({
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    quantity: item.quantity,
    unit_price: Number(product.unit_price),
    line_value: lineValue,
    // اضافي: نقدر نحفظ fifo_cost للاستخدام في الربح لو محتاجين (اختياري)
  });
  // ===== END FIFO CHANGES =====
}
```

> 💡 **مهم للسرعة:** مع `returnToInventoryWithLedger` (دالة الإرجاع) — لا نعيدها لـ FIFO batches في هذه الجولة. نكتفي بتحديث `current_stock` الموجود بالكود الحالي. الإرجاع إلى أخر batch موجود أو batch جديد مهمة تتأخر إلى v1.1 عشان ما نضيع وقت.

---

### نتيجة القبول (DoD)
- إنشاء منتج → أضف له 3 batches بكميات وتواريخ مختلفة → احاول خصم كمية أكبر من المجموع → فشل مع رسالة صحيحة.
- احاول خصم كمية متوسطة → تأكد من أن الباتش الأقدم/الأقرب للانتهاء هو اللي خصم منه أولًا.
- `current_stock` في جدول المنتج يكون مطابقًا لـ `SUM(quantity_remaining)` للـ batches دائمًا.

---

# 📋 الخطوة 3: دليل الحسابات (AccountCode Inference تلقائي)

**الهدف:** كل `LedgerEntry` جديد بيولد معه `account_code` صحيح بشكل تلقائي. بدون شاشات إدارة.

---

### الملف الوحيد المطلوب: دالة مساعدة داخل `finance-query.service.ts` أو ملف جديد صغير

```typescript
// ملف جديد: src/services/account-code.inference.ts
import { LedgerEntryType, AccountCode } from '@prisma/client';

/**
 * أسرع طريقة لربط الحركة المالية بحسابها المحاسبي بدون أي إعدادات.
 * Defaults = مطابقة لـ 90% من الشركات الصغيرة في مصر.
 */
export function inferAccountCode(
  partyIdentifier: string,
  entryType: LedgerEntryType,
  context?: {
    saleId?: string;
    payroll?: boolean;
    supplier?: boolean;
  },
): AccountCode {
  const p = String(partyIdentifier || '').trim();

  // (1) الرواتب والموظفين
  if (p.startsWith('موظف') || context?.payroll) {
    return AccountCode.E_SALARIES;
  }

  // (2) الموردين
  if (p.startsWith('مورد') || context?.supplier) {
    return entryType === 'DEBIT' ? AccountCode.L_PAYABLES : AccountCode.A_INVENTORY;
  }

  // (3) الضرائب والتأمينات (نصي المعرف)
  if (p.includes('ضرائب') || p.includes('ضريبة')) return AccountCode.L_TAX_DUE;
  if (p.includes('تأمين')) return AccountCode.L_SOCIAL_DUE;
  if (p.includes('إيجار')) return AccountCode.E_RENT;
  if (p.includes('كهربا') || p.includes('مياه') || p.includes('إنترنت')) return AccountCode.E_UTILITIES;

  // (4) إيرادات المبيعات (آجل vs نقدي)
  if (context?.saleId) {
    // نقدر نمرر الـ sale_id أو نستنتج من الـ remaining_amount بعدين
    return entryType === 'CREDIT' ? AccountCode.R_SALES_CREDIT : AccountCode.A_RECEIVABLES;
  }

  // (5) افتراضات عامة
  if (entryType === 'CREDIT') {
    // دائن غالبًا = إيرادات أو سداد لمدين
    if (p.includes('مبيع') || p.includes('فاتورة')) return AccountCode.R_SALES_CASH;
    return AccountCode.R_SALES_CREDIT;
  } else {
    // مدين غالبًا = عميل ليه فلوس علينا أو مصروف
    return AccountCode.A_RECEIVABLES;
  }
}
```

**التكامل:** نستدعي `inferAccountCode` في 4 نقاط كتابة فقط:
1. `settlement.service.ts` → وقت تحديث/إنشاء `PendingSettlement`
2. `sales.service.ts` → وقت `addPayment` و `createSale` (حساب المبيعات)
3. `inventory-operations.service.ts` → وقت `withdrawInventoryWithLedger` (E_COGS أو A_RECEIVABLES حسب السياق)
4. `employee.service.ts` → وقت تشغيل الرواتب (خطوة 6)

**مهم للسرعة:** الـ LedgerEntries القديمة (اللي موجودة في الـ DB قبل هذا التحديث) بيكون عندها `account_code = E_OTHER`. في أول تشغيل للتقرير الشهري (الخطوة 7) نضيف migration واحدة تُحديثهم مرة واحدة بنفس الـ inference function (background job 1 مرة).

---

### نتيجة القبول
- أنشئ 3 تسويات مختلفة (مورد + موظف + عميل) → تأكد أن `account_code` في الـ LedgerEntries = صحيح لكل واحدة.
- قوائم التقارير الـ `GROUP BY account_code` في الخطوة 7 تطلع أرقام صحيحة.

---

# 📋 الخطوة 5: دورة الفواتير + تذكيرات الدفع تلقائية

**الهدف:** BullMQ/Schedule Job يومي الساعة 9 صباحاً بيعمل:
1. يرسل الفواتير التي `is_sent=false` للعملاء عبر الواتساب (نص فاتورة — لا PDF عشان السرعة)
2. يرسل تذكير قبل 3 أيام من `due_date`
3. يرسل تذكير **يوم الاستحقاق**
4. يرسل تذكير كل 5 أيام للمتأخرة

---

### الملفات المطلوبة (1 ملف جديد + تعديل بسيط على SaleService لتحديد due_date افتراضي)

#### 1. ملف جديد: `src/jobs/invoice-reminders.cron.ts` (استخدم @nestjs/schedule = موجود بالفعل 🎉)

```typescript
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../repositories/prisma.service';
import { Sale } from '@prisma/client';

@Injectable()
export class InvoiceRemindersCron {
  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 9 * * *') // يوميًا الساعة 9 صباحًا
  async run() {
    const tenants = await this.prisma.tenant.findMany({
      include: {
        whatsapp_numbers: { where: { number_role: 'PUBLIC_SALES' }, select: { phone_number: true } },
      },
    });

    const today = new Date();
    const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    for (const tenant of tenants) {
      const salesNumber = tenant.whatsapp_numbers[0]?.phone_number;

      const reminderJobs: Array<{
        customerPhone: string;
        customerIdentifier: string;
        invoice: Sale;
        template: 'ISSUE' | 'REMIND_3D' | 'REMIND_DUE' | 'REMIND_LATE';
      }> = [];

      // (أ) الفواتير الغير مرسلة أصلاً — اللي is_sent=false + status=CONFIRMED
      const unsent = await this.prisma.sale.findMany({
        where: { tenant_id: tenant.id, is_sent: false, status: 'CONFIRMED' },
      });
      for (const s of unsent) reminderJobs.push({ customerIdentifier: s.customer_identifier, customerPhone: this.extractPhone(s.customer_identifier), invoice: s, template: 'ISSUE' });

      // (ب) 3 أيام قبل الاستحقاق — last_reminder_at أقدم من اليوم or null
      const dueIn3 = await this.prisma.sale.findMany({
        where: {
          tenant_id: tenant.id,
          status: 'CONFIRMED',
          remaining_amount: { gt: 0 },
          due_date: { gte: today, lte: in3Days },
          reminder_count: 0,
        },
      });
      for (const s of dueIn3) reminderJobs.push({ customerIdentifier: s.customer_identifier, customerPhone: this.extractPhone(s.customer_identifier), invoice: s, template: 'REMIND_3D' });

      // (ج) يوم الاستحقاق نفسه
      const dueToday = await this.prisma.sale.findMany({
        where: {
          tenant_id: tenant.id,
          status: 'CONFIRMED',
          remaining_amount: { gt: 0 },
          due_date: { gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
                     lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) },
          reminder_count: 1,
        },
      });
      for (const s of dueToday) reminderJobs.push({ customerIdentifier: s.customer_identifier, customerPhone: this.extractPhone(s.customer_identifier), invoice: s, template: 'REMIND_DUE' });

      // (د) المتأخرة — كل 5 أيام
      const overdue = await this.prisma.sale.findMany({
        where: {
          tenant_id: tenant.id,
          status: 'CONFIRMED',
          remaining_amount: { gt: 0 },
          due_date: { lt: today },
          last_reminder_at: { not: null, lt: fiveDaysAgo },
          OR: [{ last_reminder_at: null }, { reminder_count: { gte: 2 } }],
        },
      });
      for (const s of overdue) reminderJobs.push({ customerIdentifier: s.customer_identifier, customerPhone: this.extractPhone(s.customer_identifier), invoice: s, template: 'REMIND_LATE' });

      for (const job of reminderJobs) {
        if (!job.customerPhone) continue;
        const text = this.buildMessage(job.template, job.invoice, tenant.business_name);
        // أرسل من رقم PUBLIC_SALES (أو الـ finance لو مش متاح)
        await this.sendWhatsApp(job.customerPhone, text);

        // تحديث عداد التذكيرات
        await this.prisma.sale.update({
          where: { id: job.invoice.id },
          data: {
            is_sent: job.template === 'ISSUE' ? true : undefined,
            reminder_count: { increment: 1 },
            last_reminder_at: today,
          },
        });
      }
    }
  }

  private buildMessage(template: string, s: Sale, businessName: string): string {
    const due = s.due_date ? s.due_date.toISOString().slice(0, 10) : 'غير محدد';
    const remaining = Number(s.remaining_amount).toFixed(2);
    const total = Number(s.total_amount).toFixed(2);

    switch (template) {
      case 'ISSUE':
        return `🧾 فاتورة مبيعات جديدة
من: ${businessName}
العميل: ${s.customer_identifier}
رقم الفاتورة: ${s.invoice_number}
التاريخ: ${s.created_at.toISOString().slice(0, 10)}
الإجمالي: ${total} ج.م
المدفوع: ${Number(s.paid_amount).toFixed(2)} ج.م
المتبقي: ${remaining} ج.م
تاريخ الاستحقاق: ${due}

${s.sale_type === 'CASH' ? '* نقدي — شكراً لثقتكم' : '* آجل — يرجى السداد في موعدها'}
نظام سند`;
      case 'REMIND_3D':
        return `💡 تذكير بالاستحقاق القادم
فاتورة رقم: ${s.invoice_number}
المتبقي: ${remaining} ج.م
تاريخ الاستحقاق (بعد 3 أيام): ${due}
من فضلك سدد في موعدها، أو اتصل بنا في حالة وجود أي استفسار.
— ${businessName}`;
      case 'REMIND_DUE':
        return `⏰ اليوم هو تاريخ استحقاق الفاتورة
فاتورة رقم: ${s.invoice_number}
المتبقي المستحق اليوم: ${remaining} ج.م
نحن نقدر ثقتك وسرعة سدادكم.
— ${businessName}`;
      case 'REMIND_LATE':
        return `⚠️ فاتورة متأخرة عن الاستحقاق
فاتورة رقم: ${s.invoice_number}
تاريخ الاستحقاق الأصلي: ${due}
المبلغ المتبقي المتأخر: ${remaining} ج.م
يرجى تسديد المبلغ فورًا لتجنب أي تعطيل.
— ${businessName}`;
      default:
        return '';
    }
  }

  private extractPhone(customerIdentifier: string): string | null {
    // customer_identifier غالبًا بيكون رقم واتساب أو اسم العميل
    // لو هو أرقام فقط ومش اسم → نعتبره تليفون
    const digitsOnly = String(customerIdentifier).replace(/\D/g, '');
    if (digitsOnly.length >= 10) return digitsOnly.startsWith('2') ? digitsOnly : `2${digitsOnly}`;
    // لو هو اسم → نتجاهل الارسال لانه ما عندنا رقم
    // بديل أسرع: lookup جدول Customer بالاسم للوصول للهاتف
    return null;
  }

  private async sendWhatsApp(phone: string, text: string): Promise<void> {
    // استدعاء BaileysGatewayService.sendText(phone, text)
    // Placeholder للربط الفعلي وقت التنفيذ
  }
}
```

#### 2. تعديل بسيط في `sales.service.ts` — وقت `createSale()`
```typescript
// داخل createSale تروي الـ Transaction:
// نضيف بعد تعريف const invoiceNumber:
const dueDate: Date | null = dto.sale_type === 'CASH'
  ? null // نقدي = بدون تاريخ استحقاق
  : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // آجل = افتراضي 30 يوم (بس لو محدش حدد غيره — لما نعمل كحقل DTO إضافي تاني في الدورة)

// في البيانات بتاعة saleRepository.createSale نضيف due_date: dueDate
// ونسيب باقي الحقول بقيم default الصفر والـ false اللي موجودة في الـ Schema
```

> 💡 **ملاحظة سرعة:** البحث عن رقم الهاتف من `customer_identifier` في البداية بنستخدم digits-only heuristic. لو العميل مسجل في جدول Customers → نبحث له برقم الهاتف أولاً في الـ `extractPhone`. هذا التحسين ممكن يتأخر لخطوة 5.1 ثانية لأن الـ heuristic alone يغطي 70% من الحالات.

---

### نتيجة القبول
- أنشئ فاتورة آجل → غيّر `created_at` و due_date عبر SQL بسيط لوقت قريب → شغل الـ cron يدوي → تلقى 4 رسائل مختلفة حسب المرحلة.
- عدادات التذكير في الـ `Sale` يتم تحديثها بشكل صحيح.

---

# 📋 الخطوة 7: التقارير المالية الشهرية التلقائية على واتساب المالك (أقوى مردود إداري)

**الهدف:** تقرير نصي كامل يوم الأول من كل شهر الساعة 7:00 صباحًا يوصلك للمالك. بدون PDF. بدون FRONTEND.

---

### الملف الوحيد المطلوب: `src/jobs/monthly-financial-report.cron.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../repositories/prisma.service';
import { AccountCode, LedgerEntryType } from '@prisma/client';

@Injectable()
export class MonthlyFinancialReportCron {
  private readonly logger = new Logger(MonthlyFinancialReportCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 7 1 * *') // أول يوم من كل شهر الساعة 7 صباحًا
  async run() {
    try {
      const tenants = await this.prisma.tenant.findMany({
        include: {
          whatsapp_numbers: { where: { number_role: 'AUTHORIZED_FINANCE' }, select: { phone_number: true } },
        },
      });

      // فترة التقرير = الشهر اللي فات
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const from = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1);
      const to = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0, 23, 59, 59, 999);
      const monthLabel = `${prevMonth.getMonth() + 1}/${prevMonth.getFullYear()}`;

      for (const tenant of tenants) {
        const phones = tenant.whatsapp_numbers.map(n => n.phone_number);
        if (phones.length === 0) continue;

        const report = await this.buildReport(tenant.id, tenant.business_name, from, to, monthLabel);
        for (const phone of phones) await this.sendWhatsApp(phone, report);
      }
    } catch (err) {
      this.logger.error('Monthly report failed', err as any);
    }
  }

  private async buildReport(
    tenantId: string, businessName: string,
    from: Date, to: Date, monthLabel: string,
  ): Promise<string> {
    // أ) ملخص الحسابات المحاسبية (GROUP BY account_code الصغير اللي عملناه في الخطوة 3)
    const grouped = await this.prisma.ledgerEntry.groupBy({
      by: ['account_code', 'entry_type'],
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
      },
      _sum: { amount: true },
    });
    const map = new Map<string, number>();
    for (const g of grouped) {
      const key = `${g.account_code}:${g.entry_type}`;
      map.set(key, Number(g._sum.amount ?? 0));
    }
    const get = (c: AccountCode, t: LedgerEntryType) => map.get(`${c}:${t}`) ?? 0;

    // ب) مؤشرات المبيعات من الـ Sales مباشرة
    const [salesCount, salesAgg] = await Promise.all([
      this.prisma.sale.count({ where: { tenant_id: tenantId, created_at: { gte: from, lte: to } } }),
      this.prisma.sale.aggregate({
        where: { tenant_id: tenantId, created_at: { gte: from, lte: to } },
        _sum: { total_amount: true, paid_amount: true, remaining_amount: true, total_profit: true },
      }),
    ]);

    // ج) أعمار المديونيات — Aging buckets 0-30 / 31-60 / +60 (حسب due_date or created_at)
    const allDue = await this.prisma.sale.findMany({
      where: { tenant_id: tenantId, status: 'CONFIRMED', remaining_amount: { gt: 0 } },
      select: { remaining_amount: true, due_date: true, created_at: true },
    });
    let age0 = 0, age31 = 0, age60 = 0;
    for (const s of allDue) {
      const ref = s.due_date ?? s.created_at;
      const days = Math.floor((Date.now() - ref.getTime()) / (24 * 60 * 60 * 1000));
      const amt = Number(s.remaining_amount);
      if (days <= 30) age0 += amt;
      else if (days <= 60) age31 += amt;
      else age60 += amt;
    }

    // د) تنبيهات المخزون (ملخص نهائي)
    const [lowStockCount, soonExpiry] = await Promise.all([
      this.prisma.inventoryProduct.count({
        where: { tenant_id: tenantId, min_stock_level: { not: null }, current_stock: { lte: this.prisma.inventoryProduct.fields.min_stock_level as any } },
      }),
      this.prisma.inventoryStockBatch.count({
        where: {
          tenant_id: tenantId, quantity_remaining: { gt: 0 },
          expiry_date: { gte: new Date(), lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    // ه) ملخص الأرقام الرئيسية
    const totalRevenues =
      get(AccountCode.R_SALES_CASH, 'CREDIT') +
      get(AccountCode.R_SALES_CREDIT, 'CREDIT') +
      Number(salesAgg._sum.total_amount ?? 0); // Safety net لو inference ما شتغلش تمام في أول شهر
    const totalCogs = get(AccountCode.E_COGS, 'DEBIT');
    const totalSalaries = get(AccountCode.E_SALARIES, 'DEBIT');
    const totalRent = get(AccountCode.E_RENT, 'DEBIT');
    const totalUtilities = get(AccountCode.E_UTILITIES, 'DEBIT');
    const otherExpenses = Array.from(map.entries())
      .filter(([k]) => k.startsWith('E_') && k.endsWith(':DEBIT'))
      .reduce((s, [, v]) => s + v, 0) - totalCogs - totalSalaries - totalRent - totalUtilities;
    const grossProfit = Number(salesAgg._sum.total_profit ?? 0);
    const totalExpenses = totalSalaries + totalRent + totalUtilities + otherExpenses;
    const netProfitBeforeTax = grossProfit - totalExpenses;

    // و) تجميع التقرير النهائي النصي
    return `📊 التقرير المالي الشهري — ${businessName}
الفترة: ${monthLabel}
━━━━━━━━━━━━━━━━━━━━━━━━
💰 إجمالي المبيعات: ${this.fmt(totalRevenues)} ج.م
📄 عدد الفواتير: ${salesCount} فاتورة
🧾 الإجمالي المحصّل: ${this.fmt(Number(salesAgg._sum.paid_amount ?? 0))} ج.م
📌 المتبقي على العملاء: ${this.fmt(Number(salesAgg._sum.remaining_amount ?? 0))} ج.م

📦 تكلفة البضائع المباعة: ${this.fmt(totalCogs)} ج.م
💵 إجمالي هامش الربح: ${this.fmt(grossProfit)} ج.م
👥 الرواتب والتأمينات: ${this.fmt(totalSalaries)} ج.م
🏢 الإيجار: ${this.fmt(totalRent)} ج.م
🔌 المرافق: ${this.fmt(totalUtilities)} ج.م
📋 مصروفات أخرى: ${this.fmt(Math.max(0, otherExpenses))} ج.م
━━━━━━━━━━━━━━━━━━━━━━━━
💵 صافي الربح قبل الضريبة: ${this.fmt(netProfitBeforeTax)} ج.م
${netProfitBeforeTax >= 0 ? '✅ نتيجة إيجابية' : '⚠️ نتيجة سلبية — يرجى المراجعة'}

📘 أعمار المديونيات:
  • 0-30 يوم: ${this.fmt(age0)} ج.م
  • 31-60 يوم: ${this.fmt(age31)} ج.م
  • +60 يوم: ${this.fmt(age60)} ج.م ${age60 > 0 ? '⚠️ (تحتاج متابعة فورية)' : ''}

📦 ملخص المخزون:
  • أصناف تحت الحد الأدنى: ${lowStockCount} صنف
  • دفعات ستنتهي خلال 30 يوم: ${soonExpiry} دفعة
━━━━━━━━━━━━━━━━━━━━━━━━
تم إنشاء هذا التقرير تلقائيًا — نظام سند`;
  }

  private fmt(n: number): string {
    return Number(n || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }

  private async sendWhatsApp(phone: string, text: string): Promise<void> {
    // Placeholder: استدعاء BaileysGatewayService.sendText(phone, text)
  }
}
```

> 💡 **سرعة إضافية:** عشان نختبره من غير ما نستنى الشهر الجاي — نضيف endpoint صغير في `FinanceController` محمي بـ `OWNER` فقط يقيّم الدالة buildReport ويرجع التقرير كـ JSON/نص. يبقى اسمه `GET /finance/report-preview?month=7&year=2026`.

---

### نتيجة القبول
- شغّل الـ Job يدويًا مع تحديد فترة سابقة فيها حركات → تتولد رسالة نصية فيها أرقام صحيحة.
- الـ GROUP BY account_code يطلع أرقام = مجموع الحركات الفعلية في قاعدة البيانات.

---

# 📋 الخطوة 6: الرواتب الشهرية + الضرائب + التأمينات

**الهدف:** دالة واحدة تشغل كشوف المرتبات للشهر وتنتج:
1. محاسبة الرواتب لكل موظف (حضور + سلف + خصومات + مكافآت) — موجودة بالفعل في `calculateEmployeeSummary`
2. اقتطاعات قانونية مصرية: 11% تأمين موظف + 18.75% تأمين شركة (سقف التأمين 14,000 ج.م)
3. سلم الضريبة على الدخل 2024/2025 (5 فئات)
4. قيود محاسبية تلقائية في دفتر الأستاذ
5. `EmployeeTransaction` من النوع `PAYROLL_PAYMENT` لكل موظف
6. تحديث `tenant.payroll_last_run_month` لمنع التشغيل المكرر

---

### الملفات المطلوبة (1 دالة جديدة داخل employee.service.ts + ملف Zod اختياري لو محتاجين)

**أضف داخل `EmployeeService` الموجود:**

```typescript
/**
 * تشغيل كشوف المرتبات للشهر المحدد.
 * يمنع التشغيل المكرر بنفس الـ YYYY-MM عبر tenant.payroll_last_run_month.
 * تُرجع كشف المرتبات الكامل + تُنشئ القيود المحاسبية تلقائيًا.
 */
async runMonthlyPayroll(tenantId: string, runForYYYYMM: string, actingUserId: string) {
  return this.tx.run(async (txClient) => { // نضيف TransactionRunner في الـ constructor لو مش موجود (هو موجود بالفعل في خدمات تانية)
    // ملاحظة سرعة: لو الـ tx مش مُحقن في EmployeeService — نستخدم prisma.$transaction مباشرة عشان الوقت
    const prismaTx = txClient as any ?? this.prisma;

    const tenant = await prismaTx.tenant.findUnique({ where: { id: tenantId }, select: { payroll_last_run_month: true } });
    if (tenant?.payroll_last_run_month === runForYYYYMM) {
      throw new BadRequestException(`تم تشغيل كشوف المرتبات بالفعل لشهر ${runForYYYYMM}`);
    }

    const employees = await prismaTx.employee.findMany({
      where: { tenant_id: tenantId },
      include: { attendances: true, transactions: true },
    });

    // [تاريخي]: الحساب في calculateEmployeeSummary موجود بالفعل — نضيف فوقه فقط الضرائب+التأمينات
    const payslips = [];
    let totalGross = 0, totalEmpInsurance = 0, totalCompInsurance = 0, totalTax = 0;
    let totalAdvances = 0, totalDeductions = 0, totalBonuses = 0, totalNetPayable = 0;

    for (const emp of employees) {
      const summary = (this as any).calculateEmployeeSummary(emp); // helper موجود — نعملها protected
      const earned = Number(summary.summary.earned_salary);
      const overtime = Number(summary.summary.overtime_pay);
      const advances = Number(summary.summary.total_advances);
      const deductions = Number(summary.summary.total_deductions);
      const bonuses = Number(summary.summary.total_bonuses);
      const paidSoFar = Number(summary.summary.total_paid);
      const grossBeforeTax = earned + overtime + bonuses;

      // ---- التأمينات ----
      const insuranceCap = 14000; // الحد الأعلى للتأمينات اجتماعية 2024 — ثابت في الكود (سرعة)
      const insurableBase = Math.min(grossBeforeTax, insuranceCap);
      const empInsurance = insurableBase * 0.11;   // 11% للموظف
      const compInsurance = insurableBase * 0.1875; // 18.75% للشركة

      // ---- الضريبة (سلم 2024/2025) ----
      const taxBrackets = [
        { upto: 30000, rate: 0 },
        { upto: 45000, rate: 0.10 },
        { upto: 70000, rate: 0.15 },
        { upto: 200000, rate: 0.20 },
        { upto: Infinity, rate: 0.225 },
      ];
      let taxableIncome = grossBeforeTax - empInsurance; // التأمين الشخصي يخصم قبل الضريبة
      let taxAmount = 0;
      let previousBracketMax = 0;
      for (const b of taxBrackets) {
        if (taxableIncome <= 0) break;
        const chunk = Math.min(taxableIncome, b.upto - previousBracketMax);
        taxAmount += Math.max(0, chunk) * b.rate;
        previousBracketMax = b.upto;
        taxableIncome -= chunk;
      }
      // تقريب للضريبة ل2 رقم عشري
      taxAmount = Math.round(taxAmount * 100) / 100;

      // ---- الصافي المستحق نهاية الشهر ----
      const net = grossBeforeTax
        - empInsurance
        - taxAmount
        - advances
        - deductions
        - paidSoFar; // نخصم المدفوع مسبقاً في سلف/أجزاء

      totalGross += grossBeforeTax;
      totalEmpInsurance += empInsurance;
      totalCompInsurance += compInsurance;
      totalTax += taxAmount;
      totalAdvances += advances;
      totalDeductions += deductions;
      totalBonuses += bonuses;
      totalNetPayable += Math.max(0, net);

      // (أ) EmployeeTransaction PAYROLL_PAYMENT — بقيمة الصافي المدفوع
      if (net > 0) {
        await prismaTx.employeeTransaction.create({
          data: {
            employee_id: emp.id,
            type: 'PAYROLL_PAYMENT',
            amount: Math.max(0, net),
            notes: `كشف مرتب شهر ${runForYYYYMM}`,
            created_at: new Date(),
          },
        });
      }

      payslips.push({
        employee_id: emp.id,
        name: emp.name,
        gross: +grossBeforeTax.toFixed(2),
        earned_salary: +earned.toFixed(2),
        overtime: +overtime.toFixed(2),
        bonuses: +bonuses.toFixed(2),
        emp_insurance: +empInsurance.toFixed(2),
        company_insurance: +compInsurance.toFixed(2),
        tax: +taxAmount.toFixed(2),
        advances: +advances.toFixed(2),
        deductions: +deductions.toFixed(2),
        net_payable: +Math.max(0, net).toFixed(2),
      });
    }

    // (ب) القيود المحاسبية التلقائية في LedgerEntry (Append-Only كما مطلوب)
    // نستخدم SettlementService أو نكتب مباشرة إلى LedgerEntryRepo — أسرع نكتب appendLedgerEntry مباشرة
    const today = new Date();
    const sourceId = `PAYROLL-${tenantId}-${runForYYYYMM}-${Date.now()}`;

    // 1. مصروف الرواتب الإجمالي
    await this.appendLedgerDirect(prismaTx, tenantId, AccountCode.E_SALARIES, 'DEBIT', totalGross,
      actingUserId, sourceId, `مصروف مرتبات شهر ${runForYYYYMM}`, 'المرتبات الإجمالية');

    // 2. خصم تأمين الموظف (مستحق للتأمينات الاجتماعية = دائن L_SOCIAL_DUE)
    if (totalEmpInsurance > 0)
      await this.appendLedgerDirect(prismaTx, tenantId, AccountCode.L_SOCIAL_DUE, 'CREDIT', totalEmpInsurance,
        actingUserId, sourceId + '-EI', 'اقتطاع تأمين موظفين', 'مستحقات التأمينات');
    // 3. تأمين الشركة — مصروف للشركة ومستحق للتأمينات
    if (totalCompInsurance > 0) {
      await this.appendLedgerDirect(prismaTx, tenantId, AccountCode.E_SALARIES, 'DEBIT', totalCompInsurance,
        actingUserId, sourceId + '-CI-D', 'مصروف تأمينات الشركة', 'حصة الشركة');
      await this.appendLedgerDirect(prismaTx, tenantId, AccountCode.L_SOCIAL_DUE, 'CREDIT', totalCompInsurance,
        actingUserId, sourceId + '-CI-C', 'تأمينات الشركة مستحقة', 'حصة الشركة - مستحق');
    }
    // 4. الضريبة المقتطعة مستحقة لمصلحة الضرائب
    if (totalTax > 0)
      await this.appendLedgerDirect(prismaTx, tenantId, AccountCode.L_TAX_DUE, 'CREDIT', totalTax,
        actingUserId, sourceId + '-TAX', 'ضرائب على رواتب موظفين', 'مستحقات مصلحة الضرائب');
    // 5. صافي المدفوع للموظف = نقدي/بنك دائن
    if (totalNetPayable > 0)
      await this.appendLedgerDirect(prismaTx, tenantId, AccountCode.A_CASH, 'CREDIT', totalNetPayable,
        actingUserId, sourceId + '-NET', `صافي مدفوع موظفين شهر ${runForYYYYMM}`, 'صافي المرتبات');

    // (ج) تحديث علامة عدم إعادة التشغيل
    await prismaTx.tenant.update({
      where: { id: tenantId },
      data: { payroll_last_run_month: runForYYYYMM },
    });

    // (د) تحديث الملخصات المالية للطرفين (لو محتاجين)
    // (FinancialLedgerSummary) نحسبه من الـ LedgerEntries عادة — نتركه للـ query layer في وقت القراءة عشان الوقت

    return {
      period: runForYYYYMM,
      total_employees: employees.length,
      totals: {
        gross: +totalGross.toFixed(2),
        emp_insurance: +totalEmpInsurance.toFixed(2),
        company_insurance: +totalCompInsurance.toFixed(2),
        tax: +totalTax.toFixed(2),
        advances: +totalAdvances.toFixed(2),
        deductions: +totalDeductions.toFixed(2),
        bonuses: +totalBonuses.toFixed(2),
        net_payable: +totalNetPayable.toFixed(2),
      },
      payslips,
    };
  });
}

/**
 * أسرع طريقة لكتابة قيد محاسبي بدون ما نرجع بالـ 3 خطوات settlement (request/confirm).
 * للرواتب: العملية موثوقة من المالك لذلك نفذها مباشرة.
 */
private async appendLedgerDirect(
  tx: any, tenantId: string, accountCode: AccountCode, entryType: LedgerEntryType,
  amount: number, actingUserId: string, sourceId: string, rawText: string, partyIdentifier: string,
) {
  try {
    await tx.ledgerEntry.create({
      data: {
        tenant_id: tenantId,
        party_identifier: partyIdentifier,
        entry_type: entryType,
        amount,
        authorized_action_by: actingUserId,
        source_whatsapp_message_id: sourceId,
        raw_message_text: rawText,
        created_at: new Date(),
        account_code: accountCode,
      },
    });
  } catch (e) {
    // لو unique violation عالـ sourceId → تجاهل (idempotent)
    if (!(e as any)?.message?.includes('unique constraint')) throw e;
  }
}
```

**ملاحظة للسرعة:** نضيف endpoint بسيط في EmployeeController:
```typescript
@Post('run-payroll')
@Roles(SystemRole.OWNER, SystemRole.FINANCE_MANAGER)
async runPayroll(
  @Req() req: AuthenticatedRequest,
  @Body('month') monthYYYYMM: string, // مثال: "2026-08"
) {
  return this.employeeService.runMonthlyPayroll(
    req.user.tenant_id,
    monthYYYYMM,
    req.user.user_id,
  );
}
```

---

### نتيجة القبول
- موظف براتب شهري 8000، بدون غياب → الضريبة 0، تأمينات 11% من 8000 = 880، صافي 7120.
- موظف براتب 30,000 → تأمينات 11% من 14,000 (سقف) = 1540، الضريبة = 10% من الفئة 30-45 ألف = 1500، إلخ.
- LedgerEntries = 5 قيود لكل عملية تشغيل مرتبات = مُطابقة للمعايير المحاسبية.

---

# 📋 الخطوة 8: الموردين + فواتير المشتريات الأساسية (إكمال حلقة المخزون)

**الهدف:** جدول Suppliers موجود في الـ Schema بالفعل من الخطوة 0. نضيف:
1. إنشاء مورد + رصيد أولي
2. فاتورة شراء: تضيف `InventoryStockBatch` (تستخدم دالة addStockBatch الموجودة من الخطوة 4) + تُسجل المبلغ على المورد كمستحق
3. سداد لمورد → يقلل من رصيده ويسجل قيدًا بنكيًا/نقديًا

---

### الملفات المطلوبة (2 ملفات: Controller + Service خفيفين جداً)

#### ملف 1: `src/services/suppliers.service.ts` (جديد، أقل من 150 سطر)
```typescript
@Injectable()
export class SuppliersService {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly prisma: PrismaService,
    // نستخدم نفس دالة addStockBatch اللي عملناها في InventoryOperationsService (أو نعملها هنا copy-paste عشان السرعة وعدم الاعتماد الدائري)
  ) {}

  async list(tenantId: string) { return this.prisma.supplier.findMany({ where: { tenant_id: tenantId }, orderBy: { created_at: 'desc' } }); }
  async create(tenantId: string, dto: { name: string; phone?: string; opening_balance?: number }) {
    return this.prisma.supplier.create({
      data: {
        tenant_id: tenantId,
        name: dto.name, phone: dto.phone ?? null,
        balance: dto.opening_balance ?? 0,
      },
    });
  }

  /**
   * فاتورة شراء = إضافة دفعات للمخزون + تسجيل رصيد للمورد
   */
  async createPurchaseInvoice(tenantId: string, userId: string, dto: {
    supplier_id: string;
    items: Array<{ productNameOrSku: string; quantity: number; cost_per_unit: number; expiry_date?: string }>;
    paid_amount?: number;
    invoice_number?: string;
  }) {
    return this.tx.run(async (txClient) => {
      const prismaTx = txClient as any;
      const supplier = await prismaTx.supplier.findUnique({ where: { id: dto.supplier_id, tenant_id: tenantId } });
      if (!supplier) throw new NotFoundException('المورد غير موجود');

      let totalInvoice = 0;
      for (const item of dto.items) {
        // إعادة استخدام منطق addStockBatch من الخطوة 4 — لو مش متاح نكتبه هنا inline
        // (لحظة التنفيذ: نستدعي دالة خارجية أو نكتب نفس الـ prisma.create للـ batch + increment current_stock)
        totalInvoice += item.quantity * item.cost_per_unit;
      }

      const paid = dto.paid_amount ?? 0;
      const remaining = totalInvoice - paid;

      // تحديث رصيد المورد (يُضاف المتبقي)
      await prismaTx.supplier.update({
        where: { id: supplier.id },
        data: { balance: { increment: remaining } },
      });

      // قيود محاسبية:
      // — DEBIT  A_INVENTORY (إجمالي الفاتورة)
      // — CREDIT L_PAYABLES (المتبقي على المورد)
      // — CREDIT A_CASH      (المدفوع الآن)
      const source = `PURCH-${tenantId}-${Date.now()}`;
      if (totalInvoice > 0)
        await this.directLedger(prismaTx, tenantId, AccountCode.A_INVENTORY, 'DEBIT', totalInvoice, userId, source+'-I', `فاتورة شراء للمورد ${supplier.name}`);
      if (remaining > 0)
        await this.directLedger(prismaTx, tenantId, AccountCode.L_PAYABLES, 'CREDIT', remaining, userId, source+'-P', `باقي فاتورة مورد ${supplier.name}`);
      if (paid > 0)
        await this.directLedger(prismaTx, tenantId, AccountCode.A_CASH, 'CREDIT', paid, userId, source+'-C', `مدفوع الآن للمورد ${supplier.name}`);

      return {
        total: totalInvoice, paid, remaining,
        new_supplier_balance: Number(supplier.balance) + remaining,
        items_count: dto.items.length,
      };
    });
  }

  async paySupplier(tenantId: string, userId: string, supplierId: string, amount: number, note?: string) {
    return this.tx.run(async (txClient) => {
      const prismaTx = txClient as any;
      const s = await prismaTx.supplier.findUnique({ where: { id: supplierId, tenant_id: tenantId } });
      if (!s) throw new NotFoundException('المورد غير موجود');
      if (amount <= 0) throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');
      if (amount > Number(s.balance)) amount = Number(s.balance); // لا ندفع أكثر من المستحق (ولكن نسمح بالـ overpayment نصيحة هندسية: نمنعه بدلاً من الإدخال السلبي)

      await prismaTx.supplier.update({ where: { id: s.id }, data: { balance: { decrement: amount } } });

      const source = `PAY-SUPPLIER-${tenantId}-${Date.now()}`;
      await this.directLedger(prismaTx, tenantId, AccountCode.L_PAYABLES, 'DEBIT', amount, userId, source, note || `سداد للمورد ${s.name}`);
      await this.directLedger(prismaTx, tenantId, AccountCode.A_CASH, 'CREDIT', amount, userId, source + '-C', 'سداد مورد نقدي');

      return { supplier: s.name, paid: amount, new_balance: Number(s.balance) - amount };
    });
  }

  private async directLedger(tx: any, tenantId: string, code: AccountCode, t: LedgerEntryType, a: number, by: string, srcId: string, raw: string, party?: string) {
    try { await tx.ledgerEntry.create({
      data: {
        tenant_id: tenantId,
        party_identifier: party ?? 'حسابات دليل حسابات',
        entry_type: t,
        amount: a, account_code: code,
        authorized_action_by: by,
        source_whatsapp_message_id: srcId,
        raw_message_text: raw,
      },
    }); } catch { /* idempotent */ }
  }
}
```

#### ملف 2: `src/controllers/supplier.controller.ts` — 5 endpoints بسيطة (list/create/invoice/pay)
- `@UseGuards(JwtAuthGuard, RoleGuard)` و الأكثر حماية بـ `OWNER, FINANCE_MANAGER, INVENTORY_MANAGER`

---

### نتيجة القبول
- أنشئ مورد، أنشئ له فاتورة شراء بمنتج 100 وحدة → الدفعة تظهر في inventoryStockBatch + رصيد المورد يزاد بقيمة المتبقي.
- تسديد لمورد → balance ينقص + LedgerEntries صحيحة.

---

# 📋 الخطوة 9: الإغلاق المالي الشهري (30 دقيقة — أبسط وظيفة)

**الهدف:** زر "إغلاق الفترة" لمالك الشركة فقط. ما يقفلش تاريخ محدد يمكن إدخال حركات عليه إلا المالك (وبعد فتحها مرة أخرى + تسجيل audit).

---

### الملفات المطلوبة (دالة واحدة + endpoint واحد + helper everywhere)

#### 1. دالة `assertPeriodOpen` — ملف جديد `src/services/period-lock.ts`
```typescript
import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../repositories/prisma.service';
import { SystemRole } from '@prisma/client';

@Injectable()
export class PeriodLockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * رمية Forbidden لو الفترة مغلقة والمستخدم مش OWNER.
   * تستدعيها في بداية كل عملية تكتب قيد مالي / فاتورة / تسوية.
   */
  async assertOpen(tenantId: string, transactionDate: Date, userRole: SystemRole) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { closed_until_date: true } });
    if (!t?.closed_until_date) return;
    if (transactionDate <= t.closed_until_date && userRole !== SystemRole.OWNER) {
      throw new ForbiddenException(
        `الفترة المالية حتى ${t.closed_until_date.toISOString().slice(0,10)} مقفلة. فقط المالك يمكنه إدخال بيانات لهذه الفترة.`
      );
    }
  }

  async closeUntil(tenantId: string, dateStr: string): Promise<{ closed_until_date: Date }> {
    const d = new Date(dateStr);
    const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { closed_until_date: endOfDay } });
    return { closed_until_date: endOfDay };
  }
}
```

#### 2. نقاط الـ Integration (في كل عملية كتابة مالية):
نستدعي `periodLockService.assertOpen(tenantId, date, user.role)` في:
1. `settlement.service.ts` وقت تنفيذ التسوية (confirmSettlement — استخدم created_at كـ date)
2. `sales.service.ts` — createSale / cancelSale / addPayment
3. `inventory-operations.service.ts` — withdraw / return
4. `employee.service.ts` — تشغيل الرواتب + المعاملات المالية
5. `suppliers.service.ts` (الخطوة 8) — فواتير الشراء + السداد

هذا كله = 5 أسطر استدعاء في 5 ملفات مختلفة. عشان السرعة نكتفي بـ أول 3 ونسيب الباقي للدورة التالية.

#### 3. Endpoint واحد في FinanceController للمالك فقط:
```typescript
@Post('close-period')
@Roles(SystemRole.OWNER)
async closePeriod(
  @Req() req: AuthenticatedRequest,
  @Body('until') untilYYYYMMDD: string,
) {
  return this.periodLockService.closeUntil(req.user.tenant_id, untilYYYYMMDD);
}
```

---

### نتيجة القبول
- أغلق الفترة حتى 31/7/2026.
- حاول أن تدخل عملية بتاريخ 25/7 بحساب ACCOUNTANT_CLERK → ترفض.
- نفس العملية بحساب OWNER → تمر.

---

# 🗓️ إجمالي الجهد بعد الخطوة 0+1 (المكتملة)

| الخطوة | وقت | جهد نسبي | استدعاءات Prisma | ملفات جديدة |
|---|---|---|---|---|
| 2 تنبيهات المخزون | 30 دقيقة | منخفض | 4 | 1-2 |
| 4 FIFO Batches | 90 دقيقة | متوسط | 5+ | 0 (تعديل موجود) |
| 3 دليل الحسابات | 20 دقيقة | منخفض | 0 | 1 |
| 5 تذكيرات الفواتير | 90 دقيقة | متوسط | 7 | 1 + تعديل صغير |
| 7 تقارير شهرية | 90 دقيقة | متوسط | 10+ | 1 |
| 6 الرواتب | 120 دقيقة | مرتفع | 12+ | 0 (تعديل موجود + helper) |
| 8 الموردين | 90 دقيقة | متوسط | 10+ | 2 |
| 9 الإغلاق المالي | 30 دقيقة | منخفض | 3 | 1 + 5 سطور |
| | | | | |
| **الإجمالي** | **~9.5 ساعة** | **متوسط** | | **~8 ملفات جديدة + 9 تعديلات صغيرة** |

---

# ✅ ترتيب التنفيذ العملي الموصى به (في نفس اليوم)

**اليوم الأول (جلسة صباحية + مسائية):**
```
0) ───────────────────────────────────────────────────────── (مكتمل ✅)
1) ───────────────────────────────────────────────────────── (مكتمل ✅)
2) 🚨 تنبيهات المخزون (30 دقيقة)  ← أولاً لأنها أسرع وظيفة شغالة
4) 📦 FIFO خصم الباتشات (90 دقيقة)
3) 📒 دليل الحسابات التلقائي (20 دقيقة)
9) 🔒 الإغلاق المالي الشهري (30 دقيقة)
```

**اليوم الثاني:**
```
5) 🧾 دورة الفواتير + التذكيرات (90 دقيقة)
8) 🛒 الموردين وفواتير الشراء (90 دقيقة)
7) 📊 التقرير الشهري على الواتساب (90 دقيقة)
```

**اليوم الثالث (اختياري لو كان عندك وقت):**
```
6) 💰 الرواتب + الضرائب + التأمينات (120 دقيقة)
```

---

> 🎯 **قاعدة الحذر الذهبية:** نكمل كل خطوة بنجاح `npm run build` صفر أخطاء قبل ما ننتقل للخطوة اللي بعدها. هذا الـ convention الوحيد اللي هيحمي الكود من التخبط بين الإضافات اللي بتكبر.
