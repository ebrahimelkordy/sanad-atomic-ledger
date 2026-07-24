# خطوة 09 — تدفق طلب الأوردر الكامل (Order Placement Flow)

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

**مكوّنات الـ Sequence Diagram الرسمي (أسماء المشاركين بالحرف، استخدمها زي ما هي في الكود/التسمية):** Customer, Manager, Baileys Session Manager, incoming-messages (queue), outgoing-messages (queue), Worker Pool, tenant.guard / tenant-context, finance-role.guard, ai-orchestrator, sales-automation, finance-ledger, PostgreSQL (Prisma ORM).

---

## هدف الخطوة
تنفيذ **Sequence Flow — Automated Order Placement** بالظبط زي ما هو موجود في دايجرام الـ Sequence الرسمي (المشاركين: Customer, Baileys Session Manager, incoming-messages, Worker Pool, tenant.guard/tenant-context, ai-orchestrator, sales-automation, PostgreSQL (Prisma ORM), outgoing-messages). الخطوة دي بتفترض إن الخطوات 03 إلى 08 خلصت.

## ملاحظة معمارية مهمة قبل التسلسل
الدايجرام بيوضّح إن **الـ "Lightweight received ack" والـ "المعالجة الفعلية (async processing)" بيحصلوا كـ فرعين متوازيين (par fragment)** — يعني الـ ack بيترجع للعميل فورًا **في نفس وقت** ما المعالجة بتبدأ، مش بعدها بالترتيب. لما تنفذ `incoming-message.processor` (خطوة 06)، خلي إرجاع الـ ack مستقل تمامًا عن أي await لباقي المعالجة.

## ⚠️ ملاحظة عن الـ Idempotency (مش موجودة في رسم الدايجرام الأصلي، لكن ضرورية بعد المراجعة الأمنية)
الحماية من معالجة نفس الرسالة مرتين **مش خطوة منفصلة قبل رقم 5** — دي متضمّنة جوه خطوة 13 نفسها (`createOrderWithDetails` أو `createRejectedOrder` بيحاولوا insert بـ `source_whatsapp_message_id`، ولو حصل unique violation معناها اتعالجت قبل كده). يعني `whatsappMessageId` لازم يتمرر مع الـ job من خطوة 4 لغاية خطوة 13 كامل، من غير أي فحص أو تسجيل منفصل قبلها.

**مهم:** "معالجة قبل كده" **مش معناها "متجاهلها"** — العميل لسه محتاج يستلم رد (فاتورة أو رفض). لو الـ insert فشل بسبب التكرار، اجيب الصف الموجود وابني منه نفس الرد وابعته تاني عبر خطوة 14-17 عادي. الحماية هنا بتمنع **تكرار الكتابة على القاعدة** (خصم مخزون مرتين، قيد مالي مرتين)، مش بتمنع "الرد على العميل" — دايمًا لازم يوصله رد.

## التسلسل الكامل (رقم كل خطوة زي الدايجرام)

1. **Customer → Baileys Session Manager**: "Order request to PUBLIC_SALES number".
2. **Baileys Session Manager → incoming-messages**: "Enqueue inbound message" (الـ payload لازم يشمل `whatsappMessageId`).
3. **incoming-messages ⇢ Customer** (dashed, فرع متوازي): "Lightweight received ack" — بترجع فورًا.
4. **incoming-messages → Worker Pool**: "Deliver job" (الفرع التاني المتوازي، المعالجة الفعلية بتبدأ هنا — `whatsappMessageId` بيتمرر كامل لحد خطوة 13).
5. **Worker Pool → tenant.guard/tenant-context**: "Resolve tenant_id from phone number".
6. **tenant.guard → PostgreSQL (Prisma ORM)**: "Lookup TenantWhatsAppNumber".
7. **PostgreSQL ⇢ tenant.guard** (dashed): "Tenant context".
8. **tenant.guard ⇢ Worker Pool** (dashed): "tenant_id injected".
9. **Worker Pool → ai-orchestrator**: "Classify intent and extract order data" (استخراج المنتجات والكميات عبر AIProvider).
10. **ai-orchestrator ⇢ Worker Pool** (dashed): "Product + quantity" (structured order data).
11. **Worker Pool → sales-automation**: "Process order".
12. **sales-automation → PostgreSQL (Prisma ORM)**: "Lock InventoryProduct with SELECT FOR UPDATE" (بداية transaction).
13. **[alt: stock sufficient]** — جوه نفس الـ transaction:
    - "Decrement stock; create CustomerOrder + OrderDetail (مع `source_whatsapp_message_id` و `raw_message_text` إلزاميين — audit trail وidempotency guard معًا)؛ append DEBIT LedgerEntry" (الثلاث عمليات دي بتحصل مع بعض جوه نفس commit، عبر `CustomerOrderRepository.createOrderWithDetails`).
    - **PostgreSQL ⇢ sales-automation** (dashed): "Transaction committed".
    - **[alt: stock insufficient]** — فرع مقابل (مش مرسوم بالتفصيل في الدايجرام، لكن مطلوب حسب الـ Entity Reference): `CustomerOrderRepository.createRejectedOrder` — صف `CustomerOrder` بحالة `REJECTED_INSUFFICIENT_STOCK` بس (مع `source_whatsapp_message_id` و`raw_message_text`)، من غير `OrderDetail` ولا `LedgerEntry` ولا أي لمس للمخزون.
14. **PostgreSQL/sales-automation ⇢ Worker Pool** (dashed): "Invoice payload" (Automated invoice payload).
15. **Worker Pool → outgoing-messages**: "Enqueue invoice response".
16. **outgoing-messages → Baileys Session Manager**: "Dispatch invoice".
17. **Baileys Session Manager ⇢ Customer** (dashed): "Automated invoice".

## حالات خاصة لازم تتغطى بالكود (من الـ context العام + الدايجرام)

| الحالة | السلوك المطلوب |
|---|---|
| نفس `whatsappMessageId` وصل مرتين (retry من BullMQ مثلاً) | الـ insert في خطوة 13 (سواء `createOrderWithDetails` أو `createRejectedOrder`) بيرجع unique constraint violation على `source_whatsapp_message_id`. **متوقفش بصمت هنا** — استخدم `CustomerOrderRepository.findBySourceMessageId` (method إضافية تلاقيها في خطوة 03) تجيب الصف اللي اتسجل قبل كده، وابني نفس الفاتورة/رسالة الرفض منه، وكمّل خطوة 14 لـ17 عادي عشان تتبعت (أو تتبعت تاني). الهدف: العميل ياخد رد دايمًا، سواء أول مرة أو retry، **مش يتسيب من غير رد لمجرد إن السجل موجود قبل كده**. |
| رقم واتساب مش مسجل (خطوة 5-8 بترجع نتيجة سالبة) | drop صامت + log، مفيش رد للعميل، مفيش استكمال لباقي التسلسل |
| منتج مذكور غير موجود في `InventoryProduct` | رفض الأوردر بالكامل قبل حتى الوصول لخطوة القفل، رسالة واضحة للعميل |
| منتج مذكور غامض (أكتر من نتيجة قريبة من `findByTenantAndName`) | رفض الأوردر ورسالة توضيح تسأل العميل يحدد المنتج، **مايختارش أول نتيجة عشوائي** |
| مخزون ناقص لمنتج واحد من ضمن عدة منتجات (فرع "stock insufficient" المقابل لخطوة 13) | رفض **الأوردر كله**، `createRejectedOrder` بس (مفيش decrement ولا ledger)، حالة `REJECTED_INSUFFICIENT_STOCK`، لا partial fulfillment |
| `quantity_ordered <= 0` | رفض فوري قبل الوصول لخطوة القفل |
| فشل إرسال الفاتورة (خطوة 16-17) | retry/backoff بتاع BullMQ على `outgoing-messages` (خطوة 06)، مفيش retry يدوي |
| `intent = UNKNOWN` من الـ ai-orchestrator (خطوة 9-10) | رد افتراضي "معرفتش أفهم طلبك" بس، توقف قبل خطوة 11 (`sales-automation`) خالص |

## معايير القبول
- [ ] التسلسل الفعلي في الكود مطابق للترقيم فوق بالحرف، بنفس أسماء المكونات (`tenant.guard`, `ai-orchestrator`, `sales-automation`, إلخ).
- [ ] مفيش أي فحص idempotency منفصل قبل خطوة 13 — الحماية جوه الـ insert نفسه.
- [ ] "Lightweight received ack" بيترجع فورًا ومستقل عن باقي المعالجة (فرع متوازي حقيقي، مش sequential).
- [ ] فرع "stock sufficient" بينفذ الأربع عمليات (decrement + create order مع audit trail + append ledger) جوه transaction واحدة قبل الـ commit.
- [ ] فرع "stock insufficient" بينشئ صف `CustomerOrder` بحالة `REJECTED_INSUFFICIENT_STOCK` بس، بدون أي أثر على المخزون أو الـ ledger.
- [ ] الفاتورة اللي بترجع للعميل (خطوة 17) فيها بيانات صحيحة من الـ transaction اللي اتعملت commit ليها بس.
- [ ] كل `CustomerOrder` (سواء `CONFIRMED` أو `REJECTED_INSUFFICIENT_STOCK`) اتسجل فيه `source_whatsapp_message_id` و `raw_message_text` بدون استثناء.
- [ ] لو نفس `whatsappMessageId` اتعالج تاني (unique violation)، العميل **بياخد رد دايمًا** (فاتورة أو رفض مبني على الصف الموجود)، مش بيتسيب من غير رد.
