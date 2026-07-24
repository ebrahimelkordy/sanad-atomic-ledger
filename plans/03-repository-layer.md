# خطوة 03 — طبقة الـ Repository

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

**Idempotency إلزامي:** الحماية من تكرار معالجة نفس رسالة الواتساب بتحصل عن طريق الـ unique constraint على `source_whatsapp_message_id` (على `CustomerOrder` و`PendingSettlement`)، والـ insert بتاعه بيحصل **جوه نفس الـ transaction** اللي بتحدد النتيجة النهائية — مش عن طريق جدول منفصل بيتعمله insert قبل المعالجة (ده كان فيه عيب: لو النظام وقع بعد العلامة وقبل ما الشغل يخلص، الرسالة كانت هترفض غلط كـ"مكررة" رغم إنها معالجتش فعليًا).

**Audit trail إلزامي:** كل `CustomerOrder` وكل `LedgerEntry` مستقل لازم يتخزن معاه `source_whatsapp_message_id` و `raw_message_text`.

**Settlement confirmation إلزامي:** أي أمر تسوية مالية بيتفسّر بواسطة AI ممنوع يتنفذ فورًا — لازم يتخزن كـ `PendingSettlement` وينتظر تأكيد صريح من المدير قبل أي كتابة على `LedgerEntry` (تفاصيل خطوة 05/10).

---

## هدف الخطوة
كتابة كل الـ Repository classes. دي الطبقة **الوحيدة** المسموح لها تستورد وتستخدم `PrismaClient`. لازم قاعدة الـ schema (خطوة 02) تكون خلصت قبل ما تبدأ هنا.

## قاعدة أساسية قبل ما تكتب أي سطر
- كل method لازم اسمها وصفي (`decrementStockWithLock` مش `update`).
- **صفر منطق عمل** جوه أي repository method — ممنوع stock check، ممنوع auth check، ممنوع validation. الـ repository شغلته بس يشكّل الـ query وينفذها ويرجع بيانات typed.
- كل query لازم تتفلتر بـ `tenant_id` (إلا الحالات المحددة تحت زي `findByPhoneNumber`).

## الملفات المطلوبة بالتفصيل

### `PendingSettlementRepository` (جديد — إلزامي لتأكيد التسوية)
- `createPendingSettlement(data)` — بتحاول `insert` صف جديد بحالة `PENDING` و `expires_at` (مثلاً +5 دقايق). **الـ `source_whatsapp_message_id` unique** — لو حصل unique constraint violation، معناها نفس الرسالة اتعالجت قبل كده؛ الـ caller (خطوة 05) لازم يمسك الـ exception ده تحديدًا ويستخدم `findBySourceMessageId` تحت بدل ما يعمل واحد جديد (idempotent retry).
- `findBySourceMessageId(whatsappMessageId)` — **إلزامي، بيتستخدم وقت التكرار**: بيرجع صف الـ `PendingSettlement` الموجود بالظبط، عشان الـ service يقدر يبني منه ويبعت **نفس نص رسالة التأكيد** تاني للمدير، بدل ما "معالجة قبل كده" تعني تجاهل صامت من غير رد.
- `findActiveByTenantAndRequester(tenantId, requestedBy)` — يرجع آخر صف `PENDING` لسه في وقته (`expires_at > now()`) لنفس الرقم، لو المدير رد بـ "تأكيد" أو "لأ".
- `markConfirmed(id, tx)` / `markRejected(id)` / `markExpired(id)`. **ممنوع** أي `delete` — نفس منطق append-only لكن بحالة (status)، مش حذف.

### `TenantRepository`
- `createTenant(data)` — إنشاء tenant جديد.
- `findById(id)` — رجوع tenant بالـ id.
- `findByBusinessName(name)` — بحث بالاسم.

### `TenantWhatsAppNumberRepository`
- `findByPhoneNumber(phoneNumber)` — يرجّع صف الرقم **مع الـ tenant بتاعه** (استخدم `include: { tenant: true }`). ده بيتستخدم كل رسالة واردة فمهم يبقى fast.
- `registerNumber(tenantId, phoneNumber, numberRole)` — تسجيل رقم جديد.
- `updateConnectionStatus(numberId, status)` — تحديث حالة الاتصال (`CONNECTED`/`DISCONNECTED`/`PENDING_QR_SCAN`).

### `InventoryProductRepository`
- `findByTenantAndSku(tenantId, sku)`.
- `findByTenantAndName(tenantId, name)` — بحث تقريبي (fuzzy) لدعم الأسماء المستخرجة من الـ AI (استخدم `contains` أو `ILIKE` كخطوة أولى، ممكن تتحسّن لاحقًا بـ trigram).
- `lockForUpdate(productId)` — لازم ينفذ `SELECT ... FOR UPDATE` **جوه transaction** مبعوت من الـ caller (`tx: Prisma.TransactionClient`). استخدم `$queryRaw` مع `FOR UPDATE` لأن Prisma client API العادي مبيدعمش قفل صريح.
- `decrementStockWithLock(productId, quantity, tx)` — **لازم** يتنادى بعد `lockForUpdate` وجوه نفس الـ transaction بالظبط، وإلا في race condition. اعمل throw لو الاستدعاء جه من غير قفل سابق (documentation-level تحذير، مش لازم runtime check معقد).

### `CustomerOrderRepository`
- `createOrderWithDetails(orderData, orderDetailsData, tx)` — method واحد بيعمل insert لصف `CustomerOrder` (بحالة `CONFIRMED`، مع `source_whatsapp_message_id` و `raw_message_text`) وصفوف `OrderDetail` الأبناء **بشكل atomic** جوه نفس transaction. **لو `source_whatsapp_message_id` مكرر → unique constraint violation، ده idempotency guard حقيقي مش bug** — الـ caller (خطوة 05) يمسك الـ exception ده تحديدًا ويتعامل معاه كـ"معالجة قبل كده"، مش يفشل عشوائي.
- `createRejectedOrder(orderData, tx)` — method منفصل لحالة `REJECTED_INSUFFICIENT_STOCK`: بيعمل insert لصف `CustomerOrder` بس (بحالة `REJECTED_INSUFFICIENT_STOCK`، بردو مع `source_whatsapp_message_id` و `raw_message_text` إلزاميين)، **من غير** `OrderDetail` ولا `LedgerEntry`. نفس منطق الـ unique constraint كـ idempotency guard بينطبق هنا كمان.
- `findBySourceMessageId(whatsappMessageId)` — **إلزامي، بيتستخدم وقت التكرار**: بيرجع الصف الموجود (`CustomerOrder` بحالة `CONFIRMED` أو `REJECTED_INSUFFICIENT_STOCK`، مع `order_details` بتاعته لو موجودة) عشان الـ service يقدر يبني منه نفس الرد ويبعته تاني للعميل، بدل ما "معالجة قبل كده" تعني تجاهل صامت.
- `findByTenantAndCustomer(tenantId, customerWhatsapp)`.

### `OrderDetailRepository`
- `findByOrderId(orderId)` بس. **ممنوع** يبقى فيه create method مستقل — الإنشاء بس عن طريق `CustomerOrderRepository.createOrderWithDetails`.

### `LedgerEntryRepository`
- `appendLedgerEntry(entryData, tx)` — insert بس. **لو `source_whatsapp_message_id` مكرر (بيحصل لو نفس رسالة "تأكيد" اتعالجت مرتين) → unique constraint violation، ده idempotency guard حقيقي**، مش خطأ.
- `findByTenantAndParty(tenantId, partyIdentifier)`.
- `findBySourceMessageId(whatsappMessageId)` — **إلزامي، بيتستخدم وقت التكرار**: بيرجع القيد الموجود عشان الـ service يقدر يبني منه نفس إيصال التسوية ويبعته تاني للمدير، بدل تجاهل صامت.
- **قيد صارم:** ممنوع نهائيًا يتعمل `updateLedgerEntry` أو `deleteLedgerEntry` في الملف ده أو في أي مكان تاني في المشروع. لو حد طلب منك "صلّح" قيد غلط، الحل الوحيد قيد جديد عكسي، مش تعديل القديم.

### `FinancialLedgerSummaryRepository`
- `findByTenantAndParty(tenantId, partyIdentifier)`.
- `upsertSummary(tenantId, partyIdentifier, recalculatedFields, tx)` — `upsert` عادي على الـ unique constraint `(tenant_id, party_identifier)`.

## بنية الملفات المقترحة
```
apps/backend/src/repositories/
  pending-settlement.repository.ts  <- جديد، إلزامي
  tenant.repository.ts
  tenant-whatsapp-number.repository.ts
  inventory-product.repository.ts
  customer-order.repository.ts
  order-detail.repository.ts
  ledger-entry.repository.ts
  financial-ledger-summary.repository.ts
  prisma.service.ts   <- الوحيد اللي بيعمل instantiate لـ PrismaClient
```

- `PrismaService` (extends `PrismaClient`, `implements OnModuleInit`) — الـ instance الوحيد المستخدم في كل الـ repositories عبر Dependency Injection.

## معايير القبول
- [ ] كل repository موجود بالـ methods المذكورة بالظبط، مفيش method زيادة.
- [ ] `LedgerEntryRepository` مفيهوش update/delete خالص.
- [ ] `PendingSettlementRepository` مفيهوش delete خالص (append-only بالحالة، زي الـ ledger).
- [ ] مفيش جدول أو repository اسمه `ProcessedMessage` — الحماية من التكرار بس عبر unique constraints على `CustomerOrder`/`PendingSettlement`.
- [ ] `createOrderWithDetails` و `createRejectedOrder` و `createPendingSettlement` و `appendLedgerEntry` بيوثّقوا صراحة إن unique constraint violation عليهم هو الـ idempotency guard المتوقع، مش خطأ يتلغّم.
- [ ] كل واحدة من الأربعة فوق ليها `findBySourceMessageId` مقابلة (`CustomerOrderRepository`, `PendingSettlementRepository`, `LedgerEntryRepository`) بتُستخدم لبناء نفس الرد وإعادة إرساله عند التكرار، مش تجاهل صامت.
- [ ] `lockForUpdate` و `decrementStockWithLock` بياخدوا `tx` كـ parameter.
- [ ] مفيش أي business logic (شرط if يتحقق من كمية، أو صلاحية) داخل أي repository.
- [ ] `PrismaClient` مش متستوردة في أي مكان غير `prisma.service.ts` والـ repositories.
---

## مراجعة جودة التنفيذ الحالية — المرحلة 3 (2026-07-13)

### الحالة العامة
المرحلة 3 غير منفذة فعليًا من ناحية الكود الجاري في المشروع، رغم وجود ملفات الهيكل الأساسية في [apps/backend/src/repositories](apps/backend/src/repositories).

### الأدلة المؤكدة
- ملفات الـ repositories التالية موجودة لكن محتواها فارغ:
  - [apps/backend/src/repositories/prisma.service.ts](apps/backend/src/repositories/prisma.service.ts)
  - [apps/backend/src/repositories/tenant.repository.ts](apps/backend/src/repositories/tenant.repository.ts)
  - [apps/backend/src/repositories/tenant-whatsapp-number.repository.ts](apps/backend/src/repositories/tenant-whatsapp-number.repository.ts)
  - [apps/backend/src/repositories/inventory-product.repository.ts](apps/backend/src/repositories/inventory-product.repository.ts)
  - [apps/backend/src/repositories/customer-order.repository.ts](apps/backend/src/repositories/customer-order.repository.ts)
  - [apps/backend/src/repositories/order-detail.repository.ts](apps/backend/src/repositories/order-detail.repository.ts)
  - [apps/backend/src/repositories/ledger-entry.repository.ts](apps/backend/src/repositories/ledger-entry.repository.ts)
  - [apps/backend/src/repositories/financial-ledger-summary.repository.ts](apps/backend/src/repositories/financial-ledger-summary.repository.ts)
  - [apps/backend/src/repositories/pending-settlement.repository.ts](apps/backend/src/repositories/pending-settlement.repository.ts)
- تم تشغيل أمر البناء الخلفي بنجاح:
  - `npm run build --workspace=apps/backend`
  - النتيجة: البناء يمر، لكن هذا لا يُعد تنفيذًا للـ repository layer لأن الملفّات ما زالت فارغة.

### تقييم الجودة
- الالتزام بالهيكل: جزئي فقط.
- الالتزام بالمتطلبات الوظيفية: غير مكتمل.
- الالتزام بالمعمارية: غير مكتمل لأن الطبقة المطلوبة لم تُكتب بعد.

### المشكلة الأساسية
المرحلة 3 تحتاج تنفيذ فعلي لـ:
1. `PrismaService` كـ singleton لعميل Prisma.
2. كل repositories المطلوبة مع الأساليب المحددة في الخطة.
3. دعم `tx` للـ transactions و `FOR UPDATE` في المخزون.
4. معالجة idempotency عبر unique constraint في repositories الخاصة بالأوامر والتسوية.
5. عدم إدخال أي business logic داخل repositories.

### الحلول المطلوبة
1. كتابة `PrismaService` مع `OnModuleInit` و `enableShutdownHooks`.
2. تنفيذ كل repository مع signatures مطابقة للخطة.
3. استخدام `tenant_id` في جميع الاستعلامات ذات النطاق.
4. توثيق أن `unique constraint violation` على `createOrderWithDetails` و `createPendingSettlement` و `appendLedgerEntry` يُعتبر guard idempotency.
5. إعادة تشغيل البناء والتأكد من أن الـ backend لا يتعطل وأن الملفات تُرجع التنفيذ المتوقع.

### الخلاصة
المرحلة 3 ما زالت في مرحلة الهيكل الخارجي فقط، وليست مرحلة تنفيذ فعلي. وهي ليست جاهزة للقبول حتى تُكتب repositories الحقيقية وتُثبت عمليًا.