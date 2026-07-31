# خطوة 05 — طبقة الـ Service (Business Logic)

## السياق العام (لازم تقرأه قبل أي حاجة)

**المشروع:** Cipher — منصة SaaS متعددة المستأجرين (multi-tenant) لمحلات ومطاعم وصيدليات مصرية، بتشغّل بوت WhatsApp AI بيعمل حاجتين بس:
1. **استقبال أوردرات** من العملاء عبر WhatsApp، وتنفيذها تلقائيًا مقابل المخزون الحي.
2. **تسوية حسابات مالية** (settlement) عبر أوامر WhatsApp من رقم مُصرَّح له (مدير/محاسب)، مع تسجيل كل حركة في ledger لا يُمحى ولا يُعدَّل أبدًا (append-only).

**مش داخل في النطاق أبدًا:** ERP كامل (HR/payroll)، عملات متعددة (كله جنيه مصري)، multi-warehouse، بوابات دفع حقيقية، رسائل صوتية، مجموعات WhatsApp، e-invoicing.

**الـ Tech Stack (لا بديل):**
- Next.js (فرونت) — REST/HTTP فقط مع الباك إند
- Nest.js (باك إند) — كل الـ modules والـ business logic
- PostgreSQL — قاعدة بيانات واحدة مشتركة، عزل بـ `tenant_id` على كل جدول
- Prisma — ORM، الوصول الوحيد لقاعدة البيانات، وبس من داخل Repository Layer
- Redis + BullMQ — طابورين: `incoming-messages` و `outgoing-messages`
- Baileys — الوحيد المسموح له يتواصل مع WhatsApp مباشرة (استقبال وإرسال)

**الطبقات الأربع الصارمة (Layering) — ممنوع تجاوزها:**
1. **Schema Layer** — تعريف الـ Prisma models فقط.
2. **Repository Layer** — الوحيدة المسموح لها تستورد وتستخدم `PrismaClient`. أسماء methods وصفية (مش CRUD عام)، وصفر منطق عمل جوّاها (لا stock check، لا auth check).
3. **Service Layer** — كل منطق العمل هنا. بيستدعي repositories جوه Prisma transaction لو محتاج atomicity. ممنوع يستورد `PrismaClient`.
4. **Controller/Gateway Layer** — Nest.js REST controllers + WhatsApp gateway/processor. بيستدعوا Services بس، أبدًا مش Repositories ولا Prisma مباشرة.

**قاعدة صارمة:** أي كود في Service أو Controller بيستورد `PrismaClient` مباشرة = خطأ معماري مرفوض تمامًا، من غير استثناءات ("بس مرة واحدة" أو "بس قراءة" مرفوضين).

**Ledger append-only:** جدول `LedgerEntry` ممنوع أي `update` أو `delete` عليه في أي طبقة. تصحيح غلط = قيد (entry) جديد عكسي، مش تعديل القديم.

**تسعير تاريخي:** `OrderDetail.unit_price_at_order` snapshot وقت الأوردر بس، وممنوع يتحدّث لاحقًا حتى لو سعر المنتج الحي اتغير.

**AI Provider agnostic:** أي استدعاء لموديل AI لازم يعدّي من `AIOrchestrationService` عبر interface `AIProvider`. المسموح: `GeminiProvider`, `OpenAIProvider`, `LocalModelProvider`. ممنوع أي كود تاني يستدعي SDK خاص بموديل مباشرة.

---

## هدف الخطوة
كتابة كل منطق العمل الفعلي. الـ Services هي اللي بتنسّق بين الـ repositories وتحطهم جوه Prisma transaction لما يكون محتاج atomicity. **ممنوع** أي Service يستورد `PrismaClient` مباشرة — لازم يستخدم الـ repositories بس (من خطوة 03).

## الـ Services المطلوبة

### ⚠️ آلية الـ Idempotency المعتمدة (اقرأها قبل أي Service تاني)
**مفيش `MessageIdempotencyService` منفصل ومفيش جدول `ProcessedMessage`.** الحماية من معالجة نفس الرسالة مرتين بتحصل بشكل طبيعي عن طريق الـ unique constraint على `source_whatsapp_message_id` في `CustomerOrder` و `PendingSettlement` — والـ insert بتاعه بيحصل **جوه نفس الـ transaction** اللي بتحدد نتيجة المعالجة (نجاح أو رفض)، مش كخطوة منفصلة قبلها.

**النمط اللي كل Service تحت لازم يتبعه:**
1. حاول تنفيذ العملية كاملة (transaction) بما فيها الـ insert اللي فيه `source_whatsapp_message_id`.
2. لو الـ insert فشل بسبب unique constraint violation على `source_whatsapp_message_id` تحديدًا (مش أي خطأ تاني) → معناها الرسالة دي **اتعالجت واتسجلت بنجاح قبل كده**. امسك الـ exception ده تحديدًا، **وارجع نفس الرد اللي كان المفروض يوصل من أول مرة** — استخدم `findBySourceMessageId` (خطوة 03) تجيب الصف الموجود وابني منه نفس الفاتورة/الإيصال/رسالة التأكيد وابعتها تاني. **"معالجة قبل كده" ممنوع تعني "تجاهل صامت" — العميل أو المدير لازم ياخد رد دايمًا.**
3. أي خطأ تاني (مش unique violation) يترفع عادي كـ exception حقيقي.
4. **متعملش أي "علامة بدء معالجة" منفصلة قبل الـ transaction.** لو النظام وقع أثناء المعالجة، مفيش صف اتسجل أصلًا، فالـ retry هيشتغل من الأول وكأنها أول مرة — وده الصح.

### `TenantOnboardingService`
- `onboardTenant(businessName, verticalType, firstPhoneNumber, numberRole)`:
  1. ينادي `TenantRepository.createTenant`.
  2. ينادي `TenantWhatsAppNumberRepository.registerNumber` بالرقم الأول.
  3. يرجّع الـ tenant الكامل.

### `TenantResolutionService`
- `resolveTenantFromPhoneNumber(phoneNumber)`:
  1. ينادي `TenantWhatsAppNumberRepository.findByPhoneNumber`.
  2. لو مفيش نتيجة → يرمي exception واضح (`UnregisteredNumberException`) يتم التعامل معاه في الطبقة اللي فوق بـ drop للرسالة.
  3. لو فيه نتيجة → يرجّع `{ tenant_id, number_role }`.
- ده بيتستخدم من `tenant.guard` (خطوة 04).

### `OrderProcessorService` — تنفيذ منطق Sequence Flow 1
- `processOrder(tenantId, customerWhatsapp, extractedItems, whatsappMessageId, rawMessageText)` حيث `extractedItems` = array من `{ productNameOrSku, quantity }` جايين من الـ AI orchestrator:
  1. لكل item: ينادي `InventoryProductRepository.findByTenantAndSku` أو `findByTenantAndName` عشان يحدد المنتج الفعلي.
  2. لو منتج مش موجود → يرفض الأوردر كله برسالة واضحة (منتج غير معروف)، مايكملش جزء منه.
  3. **لو `findByTenantAndName` رجّع أكتر من نتيجة قريبة من بعض (نتيجة غامضة/ambiguous)** → يرفض الأوردر برسالة توضيح ("مش قادر أحدد المنتج بالظبط، تقصد X ولا Y؟")، **مايختارش أول نتيجة عشوائي**.
  4. يبدأ **Prisma transaction واحدة** للخطوات الجاية كلها:
     - لكل منتج: `lockForUpdate(productId)` ثم تحقق `current_stock >= quantity_ordered` (**Rule 7.3**: `quantity_ordered` لازم `> 0`).
     - **لو أي منتج ناقص مخزون** → `CustomerOrderRepository.createRejectedOrder` (بحالة `REJECTED_INSUFFICIENT_STOCK`، مع `source_whatsapp_message_id` و`raw_message_text`)، جوه **transaction منفصلة صغيرة** (من غير أي لمس للمخزون أو الـ ledger)، وارجع رفض واضح للعميل.
     - لو كله سليم: `decrementStockWithLock` لكل منتج، احسب `grand_total = Σ(quantity_ordered × unit_price)` من السعر الحي وقت التنفيذ (ده هيبقى الـ `unit_price_at_order` المحفوظ)، `CustomerOrderRepository.createOrderWithDetails` (بحالة `CONFIRMED`، مع `source_whatsapp_message_id` و `raw_message_text` إلزاميين)، ثم `LedgerEntryRepository.appendLedgerEntry` — قيد `DEBIT` بمبلغ `grand_total`، `party_identifier = customer_whatsapp`، `reference_order_id` = الأوردر الجديد، `authorized_action_by = null` (تلقائي بالكامل، مفيش تدخل بشري) — **كل ده جوه نفس الـ transaction**.
  5. **امسك unique constraint violation على `source_whatsapp_message_id`** من أي من الـ insert بتوع `createOrderWithDetails` أو `createRejectedOrder` — لو حصل، نادي `CustomerOrderRepository.findBySourceMessageId(whatsappMessageId)`، وارجع نفس الأوردر الموجود (بحالته الأصلية `CONFIRMED` أو `REJECTED_INSUFFICIENT_STOCK`) عشان يتبعت منه نفس الفاتورة/الرفض تاني للعميل — **مش تجاهل بصمت**.
  6. commit الترانزاكشن، رجّع الأوردر الكامل عشان يتبني منه الفاتورة (invoice) اللي هترجع للعميل.

### `SettlementService` — تنفيذ منطق Sequence Flow 2 (مع تأكيد إلزامي قبل التنفيذ)
**تغيير جوهري:** التسوية دلوقتي خطوتين منفصلتين، مش استدعاء واحد فوري. أي أمر تسوية بيتفسر من نص حر بواسطة AI **لازم يتأكد من المدير قبل ما يتنفذ فعليًا** على الـ ledger.

- `requestSettlement(tenantId, partyIdentifier, entryType, amount, requestedBy, whatsappMessageId, rawMessageText)` — **الخطوة الأولى**:
  1. ينادي `PendingSettlementRepository.createPendingSettlement` بحالة `PENDING` و `expires_at = now() + 5 minutes` (القيمة قابلة للتعديل لاحقًا، مش معمارية صلبة).
  2. **لو حصل unique constraint violation على `source_whatsapp_message_id`** → معناها نفس الرسالة اتعالجت قبل كده؛ نادي `PendingSettlementRepository.findBySourceMessageId` وارجع **نفس رسالة التأكيد اللي اتبعتت قبل كده بالظبط** بدل ما تعمل صف جديد أو ترفض بصمت.
  3. لو نجح الإنشاء عادي → يرجّع نص تأكيد واضح للمدير (مثلاً: "تأكيد تسجيل [DEBIT/CREDIT] بمبلغ [amount] جنيه على [partyIdentifier]؟ رد بـ (تأكيد) أو (إلغاء) خلال 5 دقايق").
  4. **مفيش أي كتابة على `LedgerEntry` أو `FinancialLedgerSummary` في الخطوة دي خالص.**

- `confirmSettlement(tenantId, requestedBy, replyText)` — **الخطوة التانية** (بترد عليها رسالة تانية من نفس رقم المدير):
  1. ينادي `PendingSettlementRepository.findActiveByTenantAndRequester(tenantId, requestedBy)`.
  2. لو مفيش صف `PENDING` نشط (خلص وقته أو مفيش أصلاً) → رد واضح "مفيش تسوية معلّقة تستنى تأكيد" ومفيش أي تنفيذ.
  3. لو `replyText` معناها رفض (إلغاء/لأ) → `markRejected`، رد تأكيد الإلغاء، **مفيش أي قيد بيتسجل**.
  4. لو `replyText` معناها موافقة (تأكيد/أيوه) → **Prisma transaction واحدة**:
     - `FinancialLedgerSummaryRepository.findByTenantAndParty` — جيب الرصيد الحالي (أو `0` لو أول مرة).
     - `LedgerEntryRepository.appendLedgerEntry` — قيد جديد بالنوع والمبلغ من صف الـ `PendingSettlement`، `authorized_action_by = requestedBy`، `source_whatsapp_message_id` و `raw_message_text` من صف الـ `PendingSettlement` الأصلي. **لو حصل unique constraint violation هنا** (يعني نفس رسالة "تأكيد" اتعالجت مرتين) → نادي `LedgerEntryRepository.findBySourceMessageId` وارجع نفس الإيصال القديم تاني، مش تجاهل بصمت.
     - أعد حساب `total_debit`, `total_credit`, `running_balance` من الـ ledger entries (مصدر الحقيقة الوحيد هو `LedgerEntry`، الـ Summary بس cache).
     - `FinancialLedgerSummaryRepository.upsertSummary` بالقيم الجديدة.
     - `PendingSettlementRepository.markConfirmed`.
  5. رجّع إيصال التسوية (receipt) فيه رقم القيد والرصيد الجديد.

- **لو الوقت خلص (`expires_at` عدّى) قبل ما المدير يرد:** أي job دوري (cron بسيط أو فحص عند كل رسالة جديدة من نفس الرقم) بينادي `markExpired`، ومفيش أي قيد بيتسجل.

### `AIOrchestrationService`
- يغلّف الـ `AIProvider` النشط (تفاصيل كاملة في خطوة 08) ويعرض method واحدة:
  - `classifyAndExtract(messageText, tenantContext)` → بترجع `{ intent: 'ORDER' | 'SETTLEMENT' | 'UNKNOWN', extractedData }`.
- هي بس اللي بتتكلم مع الـ AI provider، مفيش service تاني بيعمل كده.

## قاعدة Transaction عامة
أي عملية فيها أكتر من كتابة واحدة على القاعدة لازم تتلف جوه `prisma.$transaction(async (tx) => { ... })`، وكل الـ repository calls جوّاها لازم تاخد نفس الـ `tx` كـ parameter مش تعمل query مستقل.

## بنية الملفات
```
apps/backend/src/services/
  tenant-onboarding.service.ts
  tenant-resolution.service.ts
  order-processor.service.ts
  settlement.service.ts             <- دلوقتي فيه requestSettlement + confirmSettlement
  ai-orchestration.service.ts
```

## معايير القبول
- [ ] مفيش أي `import { PrismaClient }` جوه أي ملف service.
- [ ] مفيش `MessageIdempotencyService` ولا أي جدول/service منفصل بيعلّم "بدء معالجة" قبل الـ transaction.
- [ ] `OrderProcessorService` و `SettlementService` بيمسكوا unique constraint violation على `source_whatsapp_message_id` تحديدًا كـ "معالجة قبل كده"، مش كخطأ عام — **وبيردّوا نفس الرد اللي كان المفروض يوصل، مش يتجاهلوا الرسالة بصمت**.
- [ ] `OrderProcessorService` بيرفض الأوردر بالكامل لو أي بند فيه مخزون ناقص (مفيش partial fulfillment)، وبيرفضه كمان لو المنتج غامض (أكتر من نتيجة قريبة).
- [ ] `OrderProcessorService.processOrder` بيخزن `source_whatsapp_message_id` و `raw_message_text` إلزاميًا مع كل أوردر (`CONFIRMED` أو `REJECTED_INSUFFICIENT_STOCK`).
- [ ] `SettlementService` **ممنوع** يكتب على `LedgerEntry` من `requestSettlement` مباشرة — الكتابة الفعلية بس من `confirmSettlement` بعد تأكيد صريح.
- [ ] `SettlementService` بيعتمد على `LedgerEntry` كمصدر حقيقة، والـ Summary مجرد cache معاد حسابه.
- [ ] كل عملية متعددة الخطوات ملفوفة في `$transaction`.
- [ ] `quantity_ordered` بيتحقق إنه `> 0` قبل أي معالجة.
kt