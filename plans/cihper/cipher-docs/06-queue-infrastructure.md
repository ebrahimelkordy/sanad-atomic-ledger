# خطوة 06 — البنية التحتية للطابور (Redis + BullMQ)

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
تجهيز نظام الطابور اللي بيمرر كل رسالة واردة/صادرة عبر Redis + BullMQ، بشكل غير متزامن (async)، بدل ما الرسالة تتعالج مباشرة في نفس الـ request.

## الطابورين المطلوبين بالظبط (مفيش طابور تالت في الخطوة دي)

### `incoming-messages`
- بيتحط فيه job لكل رسالة WhatsApp واردة من `BaileysGatewayService`.
- الـ payload المتوقع: `{ whatsappMessageId, phoneNumberReceiving, customerWhatsapp, messageText, timestamp }`. **`whatsappMessageId` إلزامي في الـ payload** — ده الـ ID اللي Baileys بيديه لكل رسالة، وهو أساس منع التكرار عبر الـ unique constraints في الـ schema (خطوة 02/05)، مش عن طريق جدول أو service منفصل.
- بيتستهلك بواسطة **Worker Pool** عبر `incoming-message.processor` (تفاصيل المعالجة الكاملة في خطوة 09 و10).

### `outgoing-messages`
- بيتحط فيه job لكل رد لازم يتبعت للعميل/المدير (فاتورة، إيصال تسوية، رسالة رفض).
- الـ payload المتوقع: `{ tenantId, recipientWhatsapp, messageContent }`.
- بيتستهلك بواسطة `BaileysGatewayService` نفسه (هو اللي بيبعت فعليًا عبر WhatsApp).

## إعداد BullMQ
1. أنشئ `RedisModule` أو استخدم `@nestjs/bullmq` (لو موجود) لتسجيل الاتصال بـ Redis من الـ `.env` (`REDIS_HOST`, `REDIS_PORT`).
2. سجّل الطابورين:
   ```ts
   BullModule.registerQueue(
     { name: 'incoming-messages' },
     { name: 'outgoing-messages' },
   )
   ```
3. إعدادات الـ retry/backoff الافتراضية لكل طابور:
   - `attempts: 3`
   - `backoff: { type: 'exponential', delay: 2000 }`
   - `removeOnComplete: true` (عشان ميتراكمش redis storage)
   - `removeOnFail: false` (سيبها عشان تتفحص لاحقًا لو فيه مشكلة متكررة)

## Worker Pool
- عرّف Nest.js `Processor` واحد على طابور `incoming-messages` اسمه `incoming-message.processor` (المحتوى الفعلي بتاعه — استدعاء tenant resolution، ai orchestrator، إلخ — في خطوة 09/10، هنا بس التسجيل والهيكل).
- **دقة معمارية من الـ sequence diagram الرسمي:** الـ "Lightweight received ack" و"asynchronous processing" مش خطوتين متتاليتين، دول **فرعين متوازيين (par fragment)** بيحصلوا في نفس الوقت. يعني لما الـ job يتحط في `incoming-messages`:
  - فرع 1 (فوري): رد بسيط بيرجع للمرسل (عميل أو مدير) يفيد إن الرسالة اتستلمت.
  - فرع 2 (متوازي، مش تابع للأول): الـ Worker Pool يستلم الـ job فعليًا ويبدأ التنفيذ الكامل (tenant resolution → AI classification → business logic).
  - لما تنفذ الكود، **متخليش** فرع الـ ack ينتظر أو يعتمد على نتيجة فرع المعالجة، والعكس.

### ⚠️ ملاحظة عن الـ Idempotency في فرع المعالجة
**مفيش "علامة بدء معالجة" لازم تتعمل في أول الـ processor.** الحماية من التكرار بتحصل طبيعيًا جوه `OrderProcessorService` و `SettlementService` (خطوة 05) عن طريق الـ unique constraint على `source_whatsapp_message_id` — الـ processor هنا بس بيمرر `whatsappMessageId` من الـ job payload للـ service المناسب، وميعملش أي فحص أو تسجيل مسبق بنفسه.
- **ده مهم تحديدًا عشان يمنع سيناريو خطير:** لو كنت هتعمل علامة "بدء معالجة" منفصلة قبل الشغل الفعلي، وبعدين النظام وقع في النص (بعد العلامة، قبل ما الشغل يخلص)، أي retry بعد كده هيترفض غلط كـ"مكررة" رغم إنه معالجش حاجة فعليًا — يعني عميل يفقد أوردره بصمت. الحل الصح: العلامة والنتيجة بيتسجلوا مع بعض في نفس الـ commit، مش في خطوتين منفصلتين.

## بنية الملفات
```
apps/backend/src/queues/
  queue.module.ts
  incoming-message.processor.ts   <- سكيلتون بس، المنطق الكامل خطوة 09/10
  outgoing-message.processor.ts
```

## معايير القبول
- [ ] الطابورين `incoming-messages` و `outgoing-messages` مسجلين ومتصلين بـ Redis بنجاح.
- [ ] أي رسالة واردة بترجع lightweight ack فورًا قبل ما تتعالج فعليًا.
- [ ] `whatsappMessageId` موجود في كل payload بيتحط في `incoming-messages`، ومُمرّر كامل للـ service المناسب.
- [ ] الـ processor **مفيهوش** أي فحص أو تسجيل idempotency منفصل قبل استدعاء الـ service — الحماية جوه الـ service نفسه (خطوة 05).
- [ ] إعدادات الـ retry/backoff مطبقة زي المذكور.
- [ ] مفيش أي business logic اتكتب جوه الـ processors في الخطوة دي (هيتحط في خطوة 09/10).
