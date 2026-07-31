# Cipher — دليل التنفيذ المقسّم لخطوات (INDEX)

## الفكرة من التقسيم

كل خطوة = ملف Markdown مستقل بيحتوي على **كل** الـ context اللي الموديل محتاجه عشان ينفذ الخطوة دي بس، من غير ما يحتاج يرجع لأي محادثة قبلها. لو هتفتح شات جديد لكل خطوة، انسخ الملف كامل والصقه كـ System/أول رسالة.

**قاعدة أساسية:** ادي الموديل ملف واحد بس في كل مرة. متدّهوش أكتر من خطوة في نفس الشات. لو خلص من الخطوة، افتح شات جديد وادّيله الملف اللي بعده.

## ترتيب التنفيذ (لازم بالترتيب ده بالظبط)

| # | الملف | المحتوى | يعتمد على |
|---|---|---|---|
| 01 | `01-project-setup.md` | Monorepo, Next.js, Nest.js, Prisma init, .env | لا شيء |
| 02 | `02-database-schema.md` | Prisma schema كامل + migration | 01 |
| 03 | `03-repository-layer.md` | كل الـ Repositories (Layer 2) | 02 |
| 04 | `04-guards-middleware.md` | tenant.guard, finance-role.guard | 02 |
| 05 | `05-service-layer.md` | كل الـ Services (Layer 3) — Business logic | 03, 04 |
| 06 | `06-queue-infrastructure.md` | Redis + BullMQ queues | 01 |
| 07 | `07-baileys-gateway.md` | WhatsApp Session Manager | 06 |
| 08 | `08-ai-orchestrator.md` | AIProvider abstraction (Gemini/OpenAI/Local) | 01 |
| 09 | `09-order-placement-flow.md` | تنفيذ Sequence Flow 1 كامل | 05, 06, 07, 08 |
| 10 | `10-settlement-flow.md` | تنفيذ Sequence Flow 2 كامل | 05, 06, 07, 08 |
| 11 | `11-rest-controllers.md` | REST Controllers (Layer 4) للفرونت | 05 |
| 12 | `12-frontend-nextjs.md` | داشبورد Next.js (auth, tenants, orders, finance) | 11 |
| 13 | `13-testing-checklist.md` | اختبار كل تدفق + Edge cases | كل ما سبق |
| 14 | `14-deployment.md` | نشر المشروع (env, infra, checklist) | كل ما سبق |
| 15 | `15-deferred-hardening.md` | **مش خطوة تنفيذ** — سجل حاجات اتأجلت بوعي لما بعد v1 (RLS، إلخ) | اقرأه بعد الإطلاق |

## قواعد صارمة تتكرر في كل الخطوات (اتبعها دايمًا)

- **Multi-tenancy:** كل جدول فيه `tenant_id` — أي query لازم يتفلتر بيه. ممنوع نهائيًا query من غير `tenant_id` على أي جدول tenant-scoped.
- **4 Layers صارمة:** Schema → Repository → Service → Controller/Gateway. الـ Repository بس هو اللي يلمس `PrismaClient`. أي `PrismaClient` جوه Service أو Controller = خطأ مرفوض فورًا.
- **Ledger append-only:** جدول `LedgerEntry` ممنوع أي update أو delete عليه أبدًا، لا في schema ولا repository ولا service. تصحيح الغلط = قيد عكسي جديد.
- **الـ AI provider agnostic:** أي كود بيكلم موديل AI لازم يمر من `AIOrchestrationService` و interface اسمه `AIProvider`، مفيش كود بيستدعي Gemini/OpenAI SDK مباشرة من بره الـ providers الثلاثة.
- **التسعير التاريخي:** `OrderDetail.unit_price_at_order` بيتاخد وقت الأوردر بس، وممنوع يتحدث لاحقًا حتى لو سعر المنتج اتغير.
- **Idempotency إلزامي (محدّث):** الحماية من التكرار بتحصل عبر unique constraint على `source_whatsapp_message_id` (على `CustomerOrder` و`PendingSettlement`)، والـ insert بتاعه بيحصل جوه نفس الـ transaction اللي بتحدد النتيجة النهائية — مش عن طريق جدول أو service منفصل بيعلّم "بدء معالجة" قبل الشغل (تفاصيل خطوة 02/05).
- **Audit trail إلزامي (جديد):** كل `CustomerOrder` وكل `LedgerEntry` مستقل (مش مربوط بأوردر) لازم يتخزن معاه نص الرسالة الأصلي (`raw_message_text`) و`source_whatsapp_message_id`.
- **Settlement confirmation إلزامي (جديد):** أي أمر تسوية مالية بيتفسّر من AI **ممنوع يتنفذ فورًا** — لازم يتخزن كـ `PendingSettlement` ويتبعت تأكيد للمدير، والكتابة الفعلية على `LedgerEntry` بس بعد رد صريح بـ"تأكيد".

## الـ Tech Stack المعتمد (مفيش بديل غيره)

| التقنية | الدور |
|---|---|
| Next.js | الفرونت إند |
| Nest.js | الباك إند |
| PostgreSQL | قاعدة بيانات واحدة مشتركة، عزل بـ `tenant_id` |
| Prisma | ORM، طبقة الـ Repository بس هي اللي تستخدمه |
| Redis | تخزين الـ Queue state |
| BullMQ | طابورين: `incoming-messages`, `outgoing-messages` |
| Baileys | التواصل مع WhatsApp — **مكتبة غير رسمية، مخاطرة بيزنس موثّقة في خطوة 07، مش قرار تقني عادي** |

## تحديث: الخطوات 06، 07، 09، 10 اتراجعت ومطابقة للـ Sequence Diagram الرسمي

بعد مراجعة الـ ERD والـ System Architecture والـ Sequence Diagram الفعليين، الخطوات 09 و10 دلوقتي فيها **الترقيم والتسلسل الحرفي** زي الدايجرام (بنفس أسماء المكونات: `tenant.guard`, `finance-role.guard`, `ai-orchestrator`, `sales-automation`, `finance-ledger`, `Worker Pool`, إلخ)، بدل التخمين اللي كان موجود قبل كده. خطوة 06 اتحدّثت كمان لتوضيح إن "lightweight ack" و"async processing" فرعين متوازيين (par fragment) مش متتاليين.

## تحديث تاني: مراجعة أمنية/مالية (10 سنين خبرة) أضافت 3 متطلبات إلزامية لـ v1
بعد تقييم خبير للمشروع كامل، اتقرر إن الحاجات دي **مش تحسين اختياري، دي شرط للإطلاق**:
1. **Idempotency** (خطوات 02، 05، 06، 09، 10) — منع تكرار المعالجة لنفس الرسالة.
2. **Raw message / Audit trail** (خطوات 02، 05، 09، 10) — كل أوردر وكل قيد مالي مربوط بنص الرسالة الأصلي.
3. **Settlement confirmation** (خطوات 02، 05، 10) — تسوية مالية بخطوتين (طلب ثم تأكيد)، مش تنفيذ فوري من نص AI.

باقي الملاحظات (RLS، fuzzy matching، lock ordering، إلخ) اتوثّقت بوعي في `15-deferred-hardening.md` كحاجات مؤجلة، مش منسية.

ابدأ بملف `01-project-setup.md`.
-e 


---



# خطوة 01 — إعداد المشروع (Project Setup & Monorepo)

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

**Idempotency إلزامي:** الحماية من التكرار عبر unique constraint على `source_whatsapp_message_id` (على `CustomerOrder` و`PendingSettlement`)، بيتعمل insert ليه جوه نفس الـ transaction اللي بتحدد النتيجة النهائية — مش جدول منفصل بيتعلّم عليه قبل المعالجة (تفاصيل خطوة 02/05).

**Audit trail إلزامي:** كل `CustomerOrder` وكل `LedgerEntry` مستقل لازم يتخزن معاه `source_whatsapp_message_id` و `raw_message_text`.

**Settlement confirmation إلزامي:** أي أمر تسوية مالية بيتفسّر بواسطة AI ممنوع يتنفذ فورًا — لازم يتخزن كـ `PendingSettlement` وينتظر تأكيد صريح من المدير قبل أي كتابة على `LedgerEntry` (تفاصيل خطوة 05/10).

---

## هدف الخطوة
تجهيز هيكل المشروع الأساسي (backend + frontend) وربطهم ببعض، من غير أي business logic لسه. الخطوة دي بس بنية + أدوات.

## المطلوب تنفيذه بالترتيب

### 1. هيكل الـ Monorepo
- استخدم مجلد جذري واحد فيه:
  - `apps/backend` → مشروع Nest.js
  - `apps/frontend` → مشروع Next.js
  - `packages/shared` → أنواع (types) وenum مشتركة بين الفرونت والباك (اختياري لكن مفضّل)
- استخدم أي أداة monorepo بسيطة (npm workspaces كافية، مفيش داعي لـ Nx أو Turborepo دلوقتي).

### 2. Backend (Nest.js) — التهيئة الأولية
- أنشئ مشروع Nest.js جديد داخل `apps/backend`.
- ثبّت الحزم الأساسية: `@nestjs/config`, `@nestjs/common`, `@prisma/client`, `prisma`, `bullmq`, `ioredis`.
- أنشئ ملف `.env` بالمتغيرات دي (قيم placeholder دلوقتي):
  ```
  DATABASE_URL=postgresql://user:password@localhost:5432/cipher
  REDIS_HOST=localhost
  REDIS_PORT=6379
  AI_PROVIDER=gemini
  GEMINI_API_KEY=
  OPENAI_API_KEY=
  ```
- فعّل `ConfigModule.forRoot({ isGlobal: true })` في `AppModule`.
- **متعملش** أي module من الـ business modules (tenant-manager, sales-automation, إلخ) في الخطوة دي — دول جايين في خطوات لاحقة.

### 3. Frontend (Next.js) — التهيئة الأولية
- أنشئ مشروع Next.js (App Router) داخل `apps/frontend`.
- جهّز هيكل المجلدات الفارغ بس (هيتملى في خطوة 12):
  - `app/(auth)/`
  - `app/tenants/`
  - `app/orders/`
  - `app/finance/`
- ملف `.env.local`:
  ```
  NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
  ```

### 4. أدوات التطوير
- ESLint + Prettier على مستوى الـ monorepo.
- `tsconfig.json` مشترك base في الجذر، وكل app يعمل extend منه.
- Git: `.gitignore` يشمل `node_modules`, `.env`, `dist`, `.next`.

### 5. تشغيل تجريبي (Smoke Test)
- شغّل الباك إند (`npm run start:dev` في `apps/backend`) وتأكد إنه شغال على بورت (مثلاً 3001) ومفيش أخطاء.
- شغّل الفرونت (`npm run dev` في `apps/frontend`) وتأكد إنه شغال على بورت (مثلاً 3000).

## معايير القبول (Definition of Done)
- [ ] الباك إند بيشتغل من غير أخطاء ويرجع 404 عادي على `/` (لسه مفيش controllers).
- [ ] الفرونت بيفتح صفحة افتراضية من غير أخطاء.
- [ ] ملفات `.env` و `.env.local` موجودة ومعمول لهم `.gitignore`.
- [ ] هيكل المجلدات مطابق للمذكور فوق بالظبط.

## ملحوظة مهمة
متبدأش تكتب أي schema أو أي كود business logic في الخطوة دي. الخطوة اللي بعدها (`02-database-schema.md`) هي اللي هتاخد الـ Prisma schema كامل.
-e 


---



# خطوة 02 — قاعدة البيانات و Prisma Schema

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

## ⚠️ هذه الخطوة تتضمن 3 متطلبات إلزامية لـ v1 (مش اختيارية)
بعد مراجعة أمنية/مالية للمشروع، اتقرر إن الثلاث حاجات دي **لازم تكون موجودة من أول نسخة**، مش تحسين لاحق:
1. **Idempotency** — منع معالجة نفس رسالة الواتساب مرتين (تكرار أوردر أو قيد مالي).
2. **Raw message / Audit trail** — تخزين نص الرسالة الأصلي اللي أنتج كل أوردر وكل قيد مالي.
3. **Settlement confirmation** — أي أمر تسوية مالية لازم يتأكد قبل ما يتنفذ، مش ينفذ فورًا من نص AI مفسَّر.

الثلاث حاجات دي متجسّدة في الـ schema تحت (حقول `source_whatsapp_message_id` و `raw_message_text` على `CustomerOrder` و `LedgerEntry`، وموديل `PendingSettlement` الجديد بالكامل).

### ⚠️ ملاحظة معمارية مهمة عن آلية الـ Idempotency (تصحيح بعد مراجعة تانية)
في نسخة سابقة كان في جدول منفصل اسمه `ProcessedMessage` بيتعمله `insert` **قبل** ما المعالجة تبدأ، كـ "علامة إني بدأت أعالج الرسالة دي". **ده كان فيه عيب خطير:** لو النظام وقع أثناء المعالجة (بعد العلامة، قبل ما الشغل يخلص)، أي retry بعد كده هيتعامل مع الرسالة كـ "معالجة قبل كده" ويرفضها **بصمت** — يعني عميل ممكن يفقد أوردره بالكامل من غير ما حد يعرف.

**الحل الصحيح المعتمد دلوقتي:** مفيش جدول منفصل للـ idempotency خالص. الـ unique constraint على `source_whatsapp_message_id` في كل من `CustomerOrder` و `PendingSettlement` **هو نفسه** آلية الحماية من التكرار — لأن الـ insert بتاعه بيحصل **جوه نفس الـ transaction** اللي بتحدد النتيجة النهائية (نجاح أو رفض)، مش قبلها كخطوة منفصلة. لو الـ transaction وقعت، مفيش صف اتسجل أصلًا، فالـ retry هيشتغل من الأول عادي. لو الـ transaction نجحت، محاولة تكرار تانية هترجع unique constraint violation فورًا وواضح — وده بالظبط اللي إحنا عايزينه.

## هدف الخطوة
تعريف كل الـ models في Prisma schema بالظبط زي ما هي، وعمل أول migration، من غير أي repository أو service لسه.

## الـ Schema الكامل (انسخه حرفيًا زي ما هو، ممنوع تعديل أي اسم حقل أو نوع)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum VerticalType {
  RESTAURANT
  PHARMACY
  RETAIL
}

enum NumberRole {
  PUBLIC_SALES
  AUTHORIZED_FINANCE
}

enum OrderStatus {
  PENDING
  CONFIRMED
  REJECTED_INSUFFICIENT_STOCK
  CANCELLED
}

enum LedgerEntryType {
  DEBIT
  CREDIT
}

enum PendingSettlementStatus {
  PENDING
  CONFIRMED
  REJECTED
  EXPIRED
}

model Tenant {
  id            String    @id @default(uuid()) @db.Uuid
  business_name String
  vertical_type VerticalType
  created_at    DateTime  @default(now())

  whatsapp_numbers   TenantWhatsAppNumber[]
  inventory_products InventoryProduct[]
  customer_orders    CustomerOrder[]
  ledger_summaries   FinancialLedgerSummary[]
  ledger_entries     LedgerEntry[]
  pending_settlements PendingSettlement[]

  @@map("tenants")
}

model TenantWhatsAppNumber {
  id                String     @id @default(uuid()) @db.Uuid
  tenant_id         String     @db.Uuid
  phone_number      String
  number_role       NumberRole
  connection_status String     @default("DISCONNECTED")

  tenant Tenant @relation(fields: [tenant_id], references: [id])

  @@unique([phone_number])
  @@index([tenant_id])
  @@map("tenant_whatsapp_numbers")
}

model InventoryProduct {
  id               String  @id @default(uuid()) @db.Uuid
  tenant_id        String  @db.Uuid
  name             String
  sku              String
  current_stock    Int
  unit_price       Decimal @db.Decimal(12, 2)
  vertical_metadata Json   @default("{}")

  tenant        Tenant        @relation(fields: [tenant_id], references: [id])
  order_details OrderDetail[]

  @@unique([tenant_id, sku])
  @@index([tenant_id])
  @@map("inventory_products")
}

model CustomerOrder {
  id                          String      @id @default(uuid()) @db.Uuid
  tenant_id                   String      @db.Uuid
  customer_whatsapp           String
  grand_total                 Decimal     @db.Decimal(12, 2)
  order_status                OrderStatus @default(PENDING)
  source_whatsapp_message_id  String      @unique
  raw_message_text            String
  created_at                  DateTime    @default(now())

  tenant         Tenant        @relation(fields: [tenant_id], references: [id])
  order_details  OrderDetail[]
  ledger_entries LedgerEntry[]

  @@index([tenant_id])
  @@index([tenant_id, customer_whatsapp])
  @@map("customer_orders")
}

model OrderDetail {
  id                  String  @id @default(uuid()) @db.Uuid
  order_id            String  @db.Uuid
  product_id          String  @db.Uuid
  quantity_ordered    Int
  unit_price_at_order Decimal @db.Decimal(12, 2)

  order   CustomerOrder    @relation(fields: [order_id], references: [id])
  product InventoryProduct @relation(fields: [product_id], references: [id])

  @@index([order_id])
  @@index([product_id])
  @@map("order_details")
}

model LedgerEntry {
  id                          String          @id @default(uuid()) @db.Uuid
  tenant_id                   String          @db.Uuid
  party_identifier            String
  entry_type                  LedgerEntryType
  amount                      Decimal         @db.Decimal(12, 2)
  reference_order_id          String?         @db.Uuid
  authorized_action_by        String?
  source_whatsapp_message_id  String?         @unique
  raw_message_text            String?
  created_at                  DateTime        @default(now())

  tenant Tenant         @relation(fields: [tenant_id], references: [id])
  order  CustomerOrder? @relation(fields: [reference_order_id], references: [id])

  @@index([tenant_id])
  @@index([tenant_id, party_identifier])
  @@map("ledger_entries")
}

model PendingSettlement {
  id                          String                   @id @default(uuid()) @db.Uuid
  tenant_id                   String                   @db.Uuid
  party_identifier            String
  entry_type                  LedgerEntryType
  amount                      Decimal                  @db.Decimal(12, 2)
  requested_by                String
  source_whatsapp_message_id  String                   @unique
  raw_message_text            String
  status                      PendingSettlementStatus  @default(PENDING)
  created_at                  DateTime                 @default(now())
  expires_at                  DateTime

  tenant Tenant @relation(fields: [tenant_id], references: [id])

  @@index([tenant_id])
  @@index([tenant_id, requested_by, status])
  @@map("pending_settlements")
}

model FinancialLedgerSummary {
  id                    String          @id @default(uuid()) @db.Uuid
  tenant_id             String          @db.Uuid
  party_identifier      String
  total_debit           Decimal         @db.Decimal(12, 2) @default(0)
  total_credit          Decimal         @db.Decimal(12, 2) @default(0)
  running_balance       Decimal         @db.Decimal(12, 2) @default(0)
  last_transaction_type LedgerEntryType?
  last_recalculated_at  DateTime        @default(now())

  tenant Tenant @relation(fields: [tenant_id], references: [id])

  @@unique([tenant_id, party_identifier])
  @@index([tenant_id])
  @@map("financial_ledger_summaries")
}
```

## شرح كل جدول (context لو الموديل محتاج يفهم قبل يكتب كود عليه لاحقًا)

- **Tenant**: المستأجر (المحل/الصيدلية/المطعم). `vertical_type` بيحدد شكل الـ `vertical_metadata` وبرومبت الـ AI المستخدم.
- **TenantWhatsAppNumber**: أرقام الواتساب المسجلة. `phone_number` **unique عالميًا** (رقم واحد مايبقاش لأكتر من tenant). `number_role` بيحدد إيه الأوامر المسموحة على الرقم ده.
- **InventoryProduct**: المنتجات. `sku` unique بس على مستوى `(tenant_id, sku)` مش عالميًا.
- **CustomerOrder**: الأوردر. `grand_total` بيتحسب مرة واحدة وقت الإنشاء وميتغيّرش بعد كده. `source_whatsapp_message_id` (unique، إلزامي) و`raw_message_text` (إلزامي) — **audit trail وidempotency guard إلزامي معًا**: كل أوردر (سواء `CONFIRMED` أو `REJECTED_INSUFFICIENT_STOCK`) لازم يكون له صف واحد بس هنا مربوط بنص الرسالة الأصلي، والـ unique constraint على `source_whatsapp_message_id` هو نفسه اللي بيمنع معالجة نفس الرسالة مرتين (راجع الملاحظة المعمارية فوق).
- **OrderDetail**: بنود الأوردر. `unit_price_at_order` = snapshot سعر وقت الطلب، **ممنوع** يتحدّث لاحقًا. **موجودة بس للأوردرات `CONFIRMED`** — أوردر `REJECTED_INSUFFICIENT_STOCK` ليه صف `CustomerOrder` بس من غير `OrderDetail` ولا `LedgerEntry`.
- **LedgerEntry**: القيد المحاسبي. `amount` دايمًا موجب، الاتجاه (مدين/دائن) في `entry_type` بس. **append-only تمامًا**. `source_whatsapp_message_id` و`raw_message_text` اختياريين (nullable) لأن قيود الأوردر بيتجابلها audit trail من `CustomerOrder` نفسه عبر `reference_order_id` — لكن قيود التسوية المباشرة (مش مربوطة بأوردر) **لازم** تملأهم.
- **PendingSettlement (جديد — إلزامي لأي أمر تسوية):** أي أمر تسوية بيتفسّر بواسطة الـ AI بيتخزن هنا الأول بحالة `PENDING`، وبيتبعت للمدير رسالة تأكيد. `source_whatsapp_message_id` unique هنا كمان — **هو idempotency guard أمر التسوية الأولي نفسه** (لو نفس الرسالة اتكررت، الـ insert هيفشل ونرجّع نفس التأكيد اللي اتبعت قبل كده بدل ما نعمل صف جديد). القيد الفعلي في `LedgerEntry` **ميتسجلش إلا بعد** ما الصف ده يبقى `CONFIRMED`. لو المدير رفض أو الوقت خلص (`expires_at`)، الحالة بتبقى `REJECTED` أو `EXPIRED` ومفيش أي قيد بيتسجل.
- **FinancialLedgerSummary**: ملخص محسوب (cache) لرصيد كل طرف، بيتعمله recalculate بعد كل قيد جديد.

## قواعد الـ Indexing (Rule DB-2)
- كل جدول فيه `tenant_id` لازم يكون عليه index غير unique.
- Compound indexes إضافية على أي عمود بيتستخدم في hot-path lookup:
  - `(tenant_id, party_identifier)` على LedgerEntry
  - `(tenant_id, sku)` على InventoryProduct (unique)
  - `(tenant_id, customer_whatsapp)` على CustomerOrder
  - `(tenant_id, requested_by, status)` على PendingSettlement
- `TenantWhatsAppNumber.phone_number` عليه unique index عالمي (مش مربوط بـ tenant).
- `CustomerOrder.source_whatsapp_message_id` و `LedgerEntry.source_whatsapp_message_id` و `PendingSettlement.source_whatsapp_message_id` كلهم unique — **دول أهم indexes في المشروع من ناحية سلامة البيانات**، هما اللي بيمنعوا التكرار (مش جدول منفصل).

## خطوات التنفيذ
1. حط الـ schema فوق حرفيًا في `apps/backend/prisma/schema.prisma`.
2. شغّل `npx prisma migrate dev --name init`.
3. تأكد إن الـ migration اتعملت من غير أخطاء وإن كل الجداول والـ enums ظهرت في القاعدة.
4. شغّل `npx prisma generate` وتأكد إن `PrismaClient` اتولّد صح.
5. **متكتبش أي repository أو service في الخطوة دي.**

## معايير القبول
- [ ] كل الـ 8 models (7 الأصليين + `PendingSettlement`) + الـ 5 enums (4 الأصليين + `PendingSettlementStatus`) موجودين بالظبط زي المذكور.
- [ ] الـ migration اتنفذت من غير أخطاء.
- [ ] `@@unique([phone_number])`, `@@unique([tenant_id, sku])`, `@@unique([tenant_id, party_identifier])` موجودين.
- [ ] `CustomerOrder.source_whatsapp_message_id` و `raw_message_text` إلزاميين (مش nullable)، وكذلك على `PendingSettlement`.
- [ ] مفيش جدول `ProcessedMessage` أو أي جدول idempotency منفصل — الحماية بس عبر الـ unique constraints المذكورة.
- [ ] مفيش أي كود تاني اتكتب غير الـ schema والـ migration.
-e 


---



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
-e 


---



# خطوة 04 — Guards & Middleware

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

**Idempotency إلزامي:** الحماية من التكرار عبر unique constraint على `source_whatsapp_message_id` (على `CustomerOrder` و`PendingSettlement`)، بيتعمل insert ليه جوه نفس الـ transaction اللي بتحدد النتيجة النهائية — مش جدول منفصل بيتعلّم عليه قبل المعالجة (تفاصيل خطوة 02/05).

**Audit trail إلزامي:** كل `CustomerOrder` وكل `LedgerEntry` مستقل لازم يتخزن معاه `source_whatsapp_message_id` و `raw_message_text`.

**Settlement confirmation إلزامي:** أي أمر تسوية مالية بيتفسّر بواسطة AI ممنوع يتنفذ فورًا — لازم يتخزن كـ `PendingSettlement` وينتظر تأكيد صريح من المدير قبل أي كتابة على `LedgerEntry` (تفاصيل خطوة 05/10).

---

## هدف الخطوة
بناء الحارسين (guards) المسؤولين عن: (أ) تحديد الـ tenant بتاع الرسالة الواردة، (ب) التأكد إن رقم الواتساب اللي باعت أمر مالي فعلاً `AUTHORIZED_FINANCE`.

من الـ System Architecture: الـ guards دول شغالين قبل ما أي حاجة توصل لـ `sales-automation` أو `finance-ledger`.

## 1. `tenant.guard` (+ `tenant-context`)

**الغرض:** كل رسالة واردة من WhatsApp بييجيلها رقم هاتف (المرسل إليه، أي رقم التينانت المسجل اللي استقبل الرسالة). الـ guard ده بيحوّل الرقم ده لـ `tenant_id` سياقي متاح لباقي الطبقات.

**المنطق:**
1. ياخد `phone_number` من الـ job/request.
2. ينادي `TenantResolutionService` (من خطوة 05) اللي بيستخدم `TenantWhatsAppNumberRepository.findByPhoneNumber`.
3. لو الرقم مش موجود → reject الرسالة كاملة (log + drop)، لأن رقم مش مسجل مايستاهلش معالجة.
4. لو موجود → يحط `tenant_id` و`number_role` في context بيتبعت لكل الخطوات اللي بعده (استخدم إما Nest.js `ExecutionContext` أو object بسيط بيتمرر مع الـ job payload لو الاستدعاء من BullMQ worker مش HTTP request).

**ملحوظة معمارية:** الـ guard ده بيتصرف كـ Nest.js Guard في حالة الـ REST controllers، لكن جوه الـ `IncomingMessageProcessor` (BullMQ worker) هيبقى شكله function عادي بينادَى في أول الـ processor مش Nest Guard حرفي، لأن BullMQ processors مش HTTP pipeline. المهم إن نفس المنطق (resolve tenant من phone number) يتنفذ **قبل** أي حاجة تانية.

## 2. `finance-role.guard`

**الغرض:** التأكد إن أي أمر تسوية مالية (settlement) جاي من رقم `number_role = AUTHORIZED_FINANCE` بس.

**المنطق:**
1. ياخد `number_role` من الـ context اللي حطه `tenant.guard` قبله.
2. لو `number_role !== 'AUTHORIZED_FINANCE'` → reject فورًا (unauthorized)، اعمل log للمحاولة، **ومتكملش** لأي منطق مالي.
3. لو `AUTHORIZED_FINANCE` → استمر للـ `SettlementService`.

**قاعدة صارمة:** الـ guard ده لازم يتنفذ **قبل أي** استدعاء لـ `finance-ledger` module. أي مسار كود بيوصل لـ `SettlementService` من غير ما يعدي على الـ guard ده = ثغرة أمنية.

## بنية الملفات
```
apps/backend/src/guards/
  tenant.guard.ts
  tenant-context.ts        <- تعريف الـ context object/decorator
  finance-role.guard.ts
```

## معايير القبول
- [ ] `tenant.guard` بيرفض أي رقم مش مسجل ومش بيكمل تنفيذ.
- [ ] `finance-role.guard` بيرفض أي رقم `PUBLIC_SALES` بيحاول ينفذ أمر تسوية.
- [ ] الـ context (`tenant_id`, `number_role`) بيتحط في مكان قابل الوصول لكل الـ Services اللي جايه بعده من غير ما تعيد resolve الرقم تاني.
- [ ] كل محاولة مرفوضة بتتعمل لها log (للمراجعة الأمنية لاحقًا).
-e 


---



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
-e 


---



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
-e 


---



# خطوة 07 — بوابة WhatsApp (Baileys Session Manager)

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

---

## ⚠️ مخاطرة بيزنس (مش تقنية بس) — لازم تتوثّق صراحة
Baileys **مكتبة غير رسمية** (reverse-engineered لبروتوكول WhatsApp Web)، مش SDK رسمي من Meta. المعنى العملي:
- واتساب ممكن يبان (ban) أي رقم بيستخدم الأسلوب ده بكثافة، خصوصًا مع حجم رسائل تلقائي عالي.
- مفيش SLA أو ضمان استقرار من جهة رسمية — أي تحديث في بروتوكول واتساب ممكن يكسر المكتبة فجأة.
- ده قرار معماري واعي اتاخد للـ MVP (تكلفة أقل من WhatsApp Business API الرسمي)، **مش قرار تقني عادي**. لو المشروع كبر أو العملاء زادوا، لازم يتقيّم الانتقال لـ WhatsApp Business API الرسمي كخطوة لاحقة، مش افتراض إن Baileys هتفضل شغالة للأبد.

## هدف الخطوة
بناء `BaileysGatewayService` — المكوّن **الوحيد** في المشروع كله المسموح له يتواصل مع WhatsApp مباشرة (استقبال وإرسال)، وباقي المشروع بيكلمه بس عن طريق الطابورين (خطوة 06).

## المتطلبات الوظيفية

### 1. Multi-tenant Session Management
- كل `TenantWhatsAppNumber` (من خطوة 02) لازم يكون ليه WebSocket session مستقل جوه Baileys.
- عند تسجيل رقم جديد (`registerNumber`)، الـ gateway لازم:
  1. ينشئ session جديدة لرقم Baileys.
  2. يولّد QR code للربط، ويحدّث `connection_status = PENDING_QR_SCAN`.
  3. بعد نجاح الاتصال → `connection_status = CONNECTED`.
  4. لو الاتصال اتقطع → `connection_status = DISCONNECTED`، ويحاول يعمل reconnect تلقائي.
- استخدم `TenantWhatsAppNumberRepository.updateConnectionStatus` (من خطوة 03) عبر service مناسب، **مش** استدعاء مباشر لـ Prisma من الـ gateway.

### 2. استقبال الرسائل (Inbound)
- لما رسالة توصل عبر Baileys socket event:
  1. استخرج `whatsappMessageId` (الـ ID الفريد اللي Baileys بيديه لكل رسالة — **إلزامي**، ده أساس منع التكرار في خطوة 05/06)، `phoneNumberReceiving` (رقم التينانت اللي استقبل)، `customerWhatsapp` (رقم المرسل)، `messageText`.
  2. **تجاهل** أي حاجة مش رسالة نصية 1:1 (مفيش دعم رسائل صوتية، مفيش دعم group chats — من نطاق المشروع في `01-project-setup.md` context).
  3. حوّلها لـ job وحطها في طابور `incoming-messages` (خطوة 06) بالـ payload كامل شامل `whatsappMessageId`. الـ gateway **ماينفذش** أي منطق عمل بنفسه، دوره بس تحويل حدث Socket → job في الطابور.

### 3. إرسال الرسائل (Outbound)
- الـ gateway بيستهلك من طابور `outgoing-messages` (خطوة 06).
- لكل job: يحدد الـ session الصح بتاع الـ tenant (بناءً على `tenantId` في الـ payload)، ويبعت الرسالة عبر Baileys.
- لو الإرسال فشل (session مقطوعة مثلاً) → اعتمد على retry/backoff بتاع BullMQ (متعملش retry logic يدوي هنا).

## قاعدة معمارية صارمة
- `BaileysGatewayService` **ممنوع** يستدعي أي service من `sales-automation` أو `finance-ledger` مباشرة. تفاعله الوحيد مع باقي النظام هو enqueue/dequeue على الطابورين.
- ده بيحافظ على فصل كامل: لو WhatsApp اتغيّر لبروتوكول تاني مستقبلًا (رسمي WhatsApp Business API مثلاً)، غير الـ gateway بس، وباقي النظام مايتلمسش.

## بنية الملفات
```
apps/backend/src/whatsapp-gateway/
  baileys-session-manager.service.ts
  baileys-gateway.service.ts
  session.repository-adapter.ts   <- يستخدم TenantWhatsAppNumberRepository
```

## معايير القبول
- [ ] كل tenant له session مستقلة، ومفيش تداخل رسائل بين tenants.
- [ ] الرسالة الواردة بتتحول لـ job في `incoming-messages` بس، من غير معالجة منطق عمل جوه الـ gateway.
- [ ] `connection_status` بيتحدث صح في كل الحالات التلاتة (`PENDING_QR_SCAN`, `CONNECTED`, `DISCONNECTED`).
- [ ] الإرسال الصادر بيقرا من `outgoing-messages` بس.
-e 


---



# خطوة 08 — AI Orchestrator & Provider Abstraction

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

**Idempotency إلزامي:** الحماية من التكرار عبر unique constraint على `source_whatsapp_message_id` (على `CustomerOrder` و`PendingSettlement`)، بيتعمل insert ليه جوه نفس الـ transaction اللي بتحدد النتيجة النهائية — مش جدول منفصل بيتعلّم عليه قبل المعالجة (تفاصيل خطوة 02/05).

**Audit trail إلزامي:** كل `CustomerOrder` وكل `LedgerEntry` مستقل لازم يتخزن معاه `source_whatsapp_message_id` و `raw_message_text`.

**Settlement confirmation إلزامي:** أي أمر تسوية مالية بيتفسّر بواسطة AI ممنوع يتنفذ فورًا — لازم يتخزن كـ `PendingSettlement` وينتظر تأكيد صريح من المدير قبل أي كتابة على `LedgerEntry` (تفاصيل خطوة 05/10).

---

## هدف الخطوة
بناء طبقة تجريد (abstraction) فوق أي موديل AI، بحيث تقدر تبدّل بين Gemini وOpenAI وموديل محلي من غير ما تلمس أي كود تاني في المشروع.

## الـ Interface الأساسي

```ts
interface AIProvider {
  classifyAndExtract(
    messageText: string,
    tenantContext: { verticalType: string; tenantId: string },
  ): Promise<{
    intent: 'ORDER' | 'SETTLEMENT' | 'UNKNOWN';
    extractedData: Record<string, any>;
  }>;
}
```

## المنفذين المطلوبين (بالظبط التلاتة دول، مفيش رابع)

### `GeminiProvider implements AIProvider`
- بينادي Gemini API بالـ API key من `.env` (`GEMINI_API_KEY`).
- برومبت مبني على `vertical_type` بتاع التينانت (برومبت مختلف للمطعم عن الصيدلية عن الريتيل).

### `OpenAIProvider implements AIProvider`
- نفس الـ interface، لكن بيستخدم OpenAI SDK و `OPENAI_API_KEY`.

### `LocalModelProvider implements AIProvider`
- نفس الـ interface، لموديل محلي (self-hosted). التفاصيل الدقيقة لتشغيل الموديل المحلي (docker، endpoint، إلخ) تتحدد وقت التنفيذ الفعلي — المهم إنه يلتزم بنفس الـ interface بالظبط.

## اختيار الـ Provider
- المتغير `AI_PROVIDER` في `.env` (قيمته `gemini` | `openai` | `local`) بيحدد الـ provider النشط.
- ممكن يتحدد **لكل tenant** بدل ما يبقى global واحد (لو حابب مرونة أكتر، ضيف عمود اختياري على `Tenant` — لكن ده تغيير schema فبيتطلب migration جديدة، ميتعملش من غير موافقة صريحة).
- الاختيار بيحصل جوه `AIOrchestrationService` (خطوة 05) عبر factory بسيطة:
  ```ts
  function getAIProvider(providerName: string): AIProvider {
    switch (providerName) {
      case 'gemini': return new GeminiProvider(...);
      case 'openai': return new OpenAIProvider(...);
      case 'local': return new LocalModelProvider(...);
    }
  }
  ```

## قاعدة صارمة (تتكرر من الـ context العام)
- **الاستدعاء الوحيد المسموح** لأي AI SDK (Gemini/OpenAI/local) هو من جوه الملفات التلاتة دي بالظبط. أي كود في `sales-automation` أو `finance-ledger` أو أي مكان تاني عايز يستخدم AI لازم يعدّي من `AIOrchestrationService.classifyAndExtract` بس.

## المخرجات المتوقعة من `classifyAndExtract`
- **لو `intent = 'ORDER'`**: `extractedData` لازم يحتوي array من `{ productNameOrSku, quantity }` — ده اللي بيتبعت لـ `OrderProcessorService.processOrder` (خطوة 05/09).
- **لو `intent = 'SETTLEMENT'`**: `extractedData` لازم يحتوي `{ partyIdentifier, entryType, amount }` — ده اللي بيتبعت لـ `SettlementService.settleAccount` (خطوة 05/10).
- **لو `intent = 'UNKNOWN'`**: الرسالة بترفض بردّ افتراضي ("معرفتش أفهم طلبك") من غير أي معالجة تانية.

## بنية الملفات
```
apps/backend/src/ai-orchestrator/
  ai-provider.interface.ts
  gemini.provider.ts
  openai.provider.ts
  local-model.provider.ts
  ai-provider.factory.ts
```

## معايير القبول
- [ ] الثلاث Providers بيطبّقوا نفس الـ `AIProvider` interface بالظبط.
- [ ] تبديل الـ provider بيحصل بتغيير `.env` بس، من غير أي كود تاني يتغيّر.
- [ ] مفيش أي استدعاء مباشر لـ Gemini/OpenAI SDK من بره الملفات الثلاثة دي.
- [ ] المخرجات متوافقة تمامًا مع الشكل المطلوب من `OrderProcessorService` و `SettlementService`.
-e 


---



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
-e 


---



# خطوة 10 — تدفق تسوية الحساب المالي الكامل (Settlement Flow)

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
تنفيذ **Sequence Flow — Financial Account Settlement** بالظبط زي ما هو موجود في دايجرام الـ Sequence الرسمي (المشاركين: Manager, Baileys Session Manager, incoming-messages, Worker Pool, tenant.guard/tenant-context, finance-role.guard, finance-ledger, PostgreSQL (Prisma ORM), outgoing-messages). الخطوة دي بتفترض إن الخطوات 03 إلى 08 خلصت.

## ⚠️ ملاحظة عن الـ Idempotency (زي خطوة 09 بالظبط)
الحماية من معالجة نفس الرسالة مرتين متضمّنة جوه خطوة 13 نفسها (`PendingSettlementRepository.createPendingSettlement` بيحاول insert بـ `source_whatsapp_message_id`، ولو حصل unique violation معناها الرسالة دي اتعالجت قبل كده — رجّع نفس رسالة التأكيد اللي اتبعتت قبل كده بدل ما تعمل صف جديد). `whatsappMessageId` بيتمرر مع الـ job كامل من خطوة 4 لغاية خطوة 13، من غير أي فحص منفصل قبلها.

## ⚠️ تغيير جوهري عن الدايجرام الأصلي: التسوية بقت خطوتين مش خطوة واحدة
الدايجرام الأصلي بيرسم "Settle party account" (خطوة 12) وكأنها بتاخد القيد وتسجله على طول. بعد المراجعة الأمنية، ده **غير مقبول لـ v1**: أي أمر تسوية مالية اتفسّر بنص حر بواسطة AI **لازم يتأكد من المدير قبل ما يتسجل**. فالتسلسل تحت متقسم لمرحلتين واضحتين:
- **مرحلة أ (خطوات 12-14ب):** "Request settlement" — بس بتحسب وتعرض، **مفيش كتابة على LedgerEntry خالص**.
- **مرحلة ب (خطوات 15-21، بعد رد المدير برسالة منفصلة):** "Confirm settlement" — دي بس اللي بتكتب فعليًا.

## ℹ️ حاجتين مؤجلتين بوعي لـ v2 (تفاصيلهم في `15-deferred-hardening.md`)
1. **تمييز رد التأكيد عن رسالة عادية جديدة** — لو المدير عنده `PendingSettlement` نشط وبعت رسالة مش "تأكيد/إلغاء" واضحة، السلوك الافتراضي المقبول لـ v1: فحص كلمات مفتاحية بسيطة الأول (تأكيد/أيوه/موافق أو إلغاء/لأ/رفض) قبل أي تصنيف AI تاني؛ لو مطابقتش، اتعامل معاها كرسالة عادية (سيب الـ `PendingSettlement` زي ما هو لحد ما ينتهي وقته). مش مثالي، لكن مقبول مؤقتًا.
2. **فشل إرسال رسالة التأكيد نفسها (مش الإيصال النهائي)** — لو رسالة "تأكيد التسوية؟" فشلت توصل، أسوأ حالة إن الـ `PendingSettlement` تنتهي بـ `EXPIRED` والمدير يضطر يبعت الأمر تاني. مقبول لـ v1 لأنه مش بيسبب فقدان فلوس، بس تجربة استخدام مش مثالية.

## التسلسل الكامل (رقم كل خطوة، مبني على الدايجرام + التعديل الإلزامي فوق)

1. **Manager → Baileys Session Manager**: "Settlement command to AUTHORIZED_FINANCE number".
2. **Baileys Session Manager → incoming-messages**: "Enqueue inbound message" (الـ payload يشمل `whatsappMessageId`).
3. **incoming-messages ⇢ Manager** (dashed، فرع متوازي): "Lightweight received ack".
4. **incoming-messages → Worker Pool**: "Deliver job" (الفرع المتوازي التاني، بداية المعالجة الفعلية).
5. **Worker Pool → tenant.guard/tenant-context**: "Resolve tenant_id from phone number".
6. **tenant.guard → PostgreSQL (Prisma ORM)**: "Lookup TenantWhatsAppNumber".
7. **PostgreSQL ⇢ tenant.guard** (dashed): "Tenant context".
8. **tenant.guard ⇢ Worker Pool** (dashed): "tenant_id injected".
9. **Worker Pool → finance-role.guard**: "Check number_role".
10. **finance-role.guard → (فحص داخلي)**: "Verify AUTHORIZED_FINANCE".

## [alt: authorized] — الفرع المصرَّح له

11. **finance-role.guard ⇢ Worker Pool** (dashed): "Access granted".

### مرحلة أ — Request Settlement (لسه من غير كتابة على الـ ledger)
12. **Worker Pool → finance-ledger**: "Request settlement" (`SettlementService.requestSettlement`).
13. **finance-ledger → PostgreSQL**: `PendingSettlementRepository.createPendingSettlement` — بيحاول insert صف `PENDING` بالمبلغ والنوع والطرف و `source_whatsapp_message_id`، `expires_at = now() + 5 دقايق`. **لو حصل unique violation على `source_whatsapp_message_id`** → الرسالة دي اتعالجت قبل كده، رجّع نفس رسالة التأكيد اللي اتبعتت قبل كده بدل صف جديد.
14أ. **finance-ledger ⇢ Worker Pool** (dashed): "Confirmation required" (نص رسالة التأكيد جاهز).
14ب. **Worker Pool → outgoing-messages → Baileys Session Manager ⇢ Manager**: رسالة التأكيد بتتبعت ("تأكيد تسجيل [مبلغ] على [طرف]؟ رد بـ تأكيد/إلغاء").
- **التسلسل بيقف هنا ويستنى رد جديد من المدير كرسالة منفصلة.** مفيش أي قيد اتسجل لحد دلوقتي.

### مرحلة ب — Confirm Settlement (بعد رسالة رد جديدة من المدير)
*(الرسالة الجديدة بتاخد نفس المسار من خطوة 1 لغاية 11 تاني — tenant resolution جديد، finance-role.guard — وبعدين بدل "Request settlement" بينادي "Confirm settlement". تمييز إن الرد ده "تأكيد" وليس رسالة عادية جديدة موضّح في الملاحظة المؤجلة رقم 1 فوق:)*

15. **Worker Pool → finance-ledger**: "Confirm settlement" (`SettlementService.confirmSettlement` بالرد النصي).
- لو مفيش `PendingSettlement` نشط (خلص وقته أو اتأكد قبل كده) → رد واضح، توقف، مفيش كتابة.
- لو الرد "إلغاء" → `markRejected`، رد تأكيد الإلغاء، توقف، مفيش كتابة.
- لو الرد "تأكيد" → كمّل للخطوات الجاية جوه **transaction واحدة**:
16. **finance-ledger → PostgreSQL**: "Compute balance from LedgerEntry source of truth" (قراءة كل قيود `LedgerEntry` الخاصة بالـ `party_identifier`).
17. **PostgreSQL ⇢ finance-ledger** (dashed): "Current balance".
18. **finance-ledger → PostgreSQL**: "Append offsetting LedgerEntry" (بـ `authorized_action_by` = رقم المدير، و `source_whatsapp_message_id`/`raw_message_text` من صف الـ `PendingSettlement` الأصلي).
19. **finance-ledger → PostgreSQL**: "Recalculate FinancialLedgerSummary from LedgerEntry set" (إعادة حساب كاملة، مش تراكم تدريجي) + `markConfirmed` على الـ `PendingSettlement`.
20. **PostgreSQL ⇢ finance-ledger** (dashed): "Settlement persisted".
21. **finance-ledger ⇢ Worker Pool** (dashed): "Receipt with offsetting entry ID".
22. **Worker Pool → outgoing-messages**: "Enqueue settlement confirmation".
23. **outgoing-messages → Baileys Session Manager**: "Dispatch receipt".
24. **Baileys Session Manager ⇢ Manager** (dashed): "Settlement receipt".

## [alt: not authorized] — الفرع الغير مصرَّح له

10-alt. **(finance-role.guard) ⇢ Worker Pool** (dashed): "Reject before finance-ledger".
- **ملاحظة حرجة (مذكورة كنص صريح في الدايجرام):** "unauthorized attempt is dropped and logged" — أي محاولة غير مصرَّح لها بتتـ drop وتتـ log فورًا.
- "Stop processing" (self-loop) — **التسلسل بيقف هنا تمامًا**. مفيش أي استدعاء لـ `finance-ledger`، ومفيش أي رد بيتبعت للمدير في المسار ده أصلاً (لا نجاح ولا رفض صريح عبر واتساب — الرفض بيبقى صامت من ناحية القناة، بس مسجل في اللوج).

## حالات خاصة لازم تتغطى بالكود

| الحالة | السلوك المطلوب |
|---|---|
| نفس `whatsappMessageId` وصل مرتين | الـ insert في خطوة 13 بيرجع unique constraint violation على `source_whatsapp_message_id` — استخدم `findBySourceMessageId` وارجع **نفس رسالة التأكيد اللي اتبعتت قبل كده**، مش تجاهل صامت |
| رقم `PUBLIC_SALES` حاول ينفذ أمر تسوية (فرع "not authorized"، خطوة 10) | **Reject before finance-ledger**، log للمحاولة، توقف كامل (Stop processing)، صفر قيود |
| رقم مش مسجل خالص (فشل خطوات 5-8) | drop في مرحلة الـ tenant resolution، مفيش استكمال |
| `entryType` مش `DEBIT` ولا `CREDIT` | رفض الأمر قبل خطوة 12، رسالة خطأ واضحة |
| `amount` سالب أو صفر | رفض الأمر — `amount` دايمًا موجب، الاتجاه في `entry_type` بس |
| المدير ماردّش خلال 5 دقايق (`expires_at` عدّى) | `PendingSettlement` بتتحول لـ `EXPIRED`، مفيش أي قيد بيتسجل، لو حاول يأكد بعدين يترفض برسالة "مفيش تسوية معلّقة" |
| المدير بعت أمر تسوية جديد وعنده واحد `PENDING` لسه شغال | المفروض تتعامل معاه كـ "تسوية جديدة تحل محل القديمة" أو ترفض لحد ما يرد على القديمة — اختار سلوك واحد واثبته، المهم متسجلش قيدين لطلبين متداخلين |
| نفس أمر التسوية اتأكد مرتين بالغلط | كل تأكيد ناجح بيولّد قيد جديد مستقل (append-only) — لو حصل تكرار فعلي، التصحيح قيد عكسي يدوي، مش تعديل أو حذف |
| رد المدير مش "تأكيد/إلغاء" واضح (رسالة عادية وهو في حالة `PENDING`) | *(مؤجل لـ v2 — راجع `15-deferred-hardening.md` بند 1)* سلوك v1 المؤقت: فحص كلمات مفتاحية بسيطة، لو متطابقتش سيب الـ `PendingSettlement` زي ما هو |
| فشل إرسال رسالة التأكيد نفسها (مش الإيصال النهائي) | *(مؤجل لـ v2 — راجع `15-deferred-hardening.md` بند 2)* أسوأ حالة: `PendingSettlement` تنتهي `EXPIRED`، المدير يبعت الأمر تاني |
| فشل إرسال الإيصال النهائي (خطوة 23-24) | retry/backoff بتاع BullMQ على `outgoing-messages` (خطوة 06) |

## تذكير بقاعدة الـ Ledger (append-only)
في خطوة 18-19 وسوسة كبيرة إنك "تصلّح" أو "تلغي" قيد غلط بـ update/delete. **ممنوع منعًا باتًا.** أي تصحيح = قيد جديد بعكس الاتجاه.

## معايير القبول
- [ ] التسلسل الفعلي في الكود مطابق للترقيم فوق بالحرف، وبنفس أسماء المكونات (`finance-role.guard`, `finance-ledger`, إلخ).
- [ ] مفيش أي فحص idempotency منفصل قبل خطوة 13 — الحماية جوه الـ insert نفسه.
- [ ] لو حصل تكرار (unique violation) في أي مرحلة (طلب تأكيد أو تأكيد نهائي)، المدير **بياخد رد دايمًا** (نفس رسالة التأكيد أو نفس الإيصال القديم)، مش بيتسيب من غير رد.
- [ ] **مفيش أي كتابة على `LedgerEntry` من `requestSettlement` (مرحلة أ) خالص** — الكتابة الفعلية بس من `confirmSettlement` (مرحلة ب) بعد رد صريح بـ"تأكيد".
- [ ] محاولة تسوية من رقم `PUBLIC_SALES` بترفض عند خطوة 10 بالظبط (قبل `finance-ledger`)، ومفيش أي قيد بيتسجل، ومفيش رد بيتبعت عبر واتساب في المسار ده.
- [ ] كل تسوية ناجحة بتولّد قيد واحد جديد في `LedgerEntry` (خطوة 18) وإعادة حساب كاملة لـ `FinancialLedgerSummary` (خطوة 19) — مش تحديث تراكمي جزئي.
- [ ] `authorized_action_by` مسجل صح في القيد الناتج عن خطوة 18.
- [ ] `PendingSettlement` بتتحول لـ `EXPIRED` تلقائيًا لو عدّى وقتها من غير رد.
- [ ] الإيصال (خطوة 24) فيه رقم القيد الجديد والرصيد المحدث.
-e 


---



# خطوة 11 — REST Controllers (للفرونت إند)

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

**Idempotency إلزامي:** الحماية من التكرار عبر unique constraint على `source_whatsapp_message_id` (على `CustomerOrder` و`PendingSettlement`)، بيتعمل insert ليه جوه نفس الـ transaction اللي بتحدد النتيجة النهائية — مش جدول منفصل بيتعلّم عليه قبل المعالجة (تفاصيل خطوة 02/05).

**Audit trail إلزامي:** كل `CustomerOrder` وكل `LedgerEntry` مستقل لازم يتخزن معاه `source_whatsapp_message_id` و `raw_message_text`.

**Settlement confirmation إلزامي:** أي أمر تسوية مالية بيتفسّر بواسطة AI ممنوع يتنفذ فورًا — لازم يتخزن كـ `PendingSettlement` وينتظر تأكيد صريح من المدير قبل أي كتابة على `LedgerEntry` (تفاصيل خطوة 05/10).

---

## هدف الخطوة
بناء الـ Controllers اللي بيستهلكها الفرونت إند (Next.js). دي جزء من Layer 4 (Controller/Gateway) — بتنادي Services بس (خطوة 05)، أبدًا مش Repositories ولا Prisma مباشرة.

## الـ Controllers المطلوبة

### `AuthController`
- `POST /auth/login` — تسجيل دخول (JWT-based، تفاصيل الـ auth strategy تُبنى بمعايير Nest.js القياسية: `@nestjs/passport` + `@nestjs/jwt`).
- `POST /auth/register` — تسجيل مستخدم أول مرتبط بـ tenant (بينادي `TenantOnboardingService`).

### `TenantController`
- `GET /tenants/me` — بيانات التينانت الحالي (من الـ JWT).
- `POST /tenants/whatsapp-numbers` — تسجيل رقم واتساب جديد (بينادي `TenantWhatsAppNumberRepository` عبر service مناسب — أنشئ method في `TenantOnboardingService` أو service مخصص لو محتاج).
- `GET /tenants/whatsapp-numbers` — عرض الأرقام المسجلة وحالة اتصالها.

### `OrderController`
- `GET /orders` — كل الأوردرات بتاعة التينانت الحالي (paginated)، بيستخدم `CustomerOrderRepository.findByTenantAndCustomer` أو method عامة مشابهة عبر service.
- `GET /orders/:id` — تفاصيل أوردر واحد (order + order details).

### `FinanceController`
- `GET /finance/ledger` — كل قيود الـ ledger بتاعة تينانت معين (فلترة اختيارية بـ `party_identifier`).
- `GET /finance/summary` — ملخص الأرصدة (`FinancialLedgerSummary`) لكل الأطراف أو طرف معين.

## قاعدة صارمة
- كل controller **لازم** يستدعي Service، مش Repository، ومش Prisma. لو محتاج query جديدة مش موجودة في أي service حالي، ضيفها للـ service المناسب (خطوة 05) الأول، وبعدين استدعيها من الـ controller.
- كل endpoint (غير `/auth/*`) لازم يكون محمي بـ auth guard بيتأكد من الـ JWT ويستخرج `tenant_id` بتاع المستخدم المسجل دخوله، وكل query تتفلتر تلقائيًا بـ `tenant_id` ده (تمامًا زي عزل الـ multi-tenancy على مستوى قاعدة البيانات).

## بنية الملفات
```
apps/backend/src/controllers/
  auth.controller.ts
  tenant.controller.ts
  order.controller.ts
  finance.controller.ts
```

## معايير القبول
- [ ] كل الـ endpoints المذكورة موجودة وبترجع بيانات صحيحة من tenant التسجيل الدخول بتاعه بس.
- [ ] مفيش أي endpoint بيرجع بيانات تينانت تاني (اختبر بمحاولة الوصول لـ tenant_id مختلف والتأكد من الرفض).
- [ ] كل الـ endpoints (غير auth) محمية بـ JWT guard.
- [ ] الـ controllers مفيهاش أي business logic (validation منطقي، حسابات) — كل ده في الـ Services.
-e 


---



# خطوة 12 — الفرونت إند (Next.js Dashboard)

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

**Idempotency إلزامي:** الحماية من التكرار عبر unique constraint على `source_whatsapp_message_id` (على `CustomerOrder` و`PendingSettlement`)، بيتعمل insert ليه جوه نفس الـ transaction اللي بتحدد النتيجة النهائية — مش جدول منفصل بيتعلّم عليه قبل المعالجة (تفاصيل خطوة 02/05).

**Audit trail إلزامي:** كل `CustomerOrder` وكل `LedgerEntry` مستقل لازم يتخزن معاه `source_whatsapp_message_id` و `raw_message_text`.

**Settlement confirmation إلزامي:** أي أمر تسوية مالية بيتفسّر بواسطة AI ممنوع يتنفذ فورًا — لازم يتخزن كـ `PendingSettlement` وينتظر تأكيد صريح من المدير قبل أي كتابة على `LedgerEntry` (تفاصيل خطوة 05/10).

---

## هدف الخطوة
بناء داشبورد بسيط بيستهلك الـ REST API من خطوة 11. النطاق هنا: auth + عرض بيانات، **مش** بناء بوت واتساب أو أي منطق عمل (ده كله في الباك إند).

## الصفحات المطلوبة

### `app/(auth)/`
- صفحة `login` — فورم بسيط (email/password) بينادي `POST /auth/login`، يخزن الـ JWT (استخدم httpOnly cookie لو ممكن، أو state management عادي لو مش هتتعمل SSR كامل).
- صفحة `register` — تسجيل تينانت جديد، بينادي `POST /auth/register`.

### `app/tenants/`
- عرض بيانات التينانت الحالي (`GET /tenants/me`).
- جدول بالأرقام المسجلة وحالة الاتصال (`GET /tenants/whatsapp-numbers`) — لو الحالة `PENDING_QR_SCAN` اعرض QR code (يتطلب endpoint يرجع صورة/بيانات الـ QR — لو مش موجودة في خطوة 11، ضيفها كخطوة تكميلية صغيرة مش تغيير معماري).
- فورم تسجيل رقم جديد (`POST /tenants/whatsapp-numbers`).

### `app/orders/`
- جدول بكل الأوردرات (`GET /orders`) مع فلترة بالحالة (`PENDING`, `CONFIRMED`, `REJECTED_INSUFFICIENT_STOCK`, `CANCELLED`).
- صفحة تفاصيل أوردر واحد (`GET /orders/:id`) بتعرض المنتجات، الكميات، السعر وقت الطلب، الإجمالي.

### `app/finance/`
- جدول بقيود الـ ledger (`GET /finance/ledger`) — عمود لكل من `party_identifier`, `entry_type`, `amount`, `authorized_action_by`, `created_at`.
- ملخص الأرصدة (`GET /finance/summary`) — كارت أو جدول لكل طرف بالرصيد الحالي (`running_balance`).

## قواعد عامة للفرونت
- كل الاتصال بالباك إند عبر `NEXT_PUBLIC_API_BASE_URL` (من خطوة 01).
- أرفق الـ JWT في كل request (Authorization header أو cookie حسب استراتيجية الـ auth المختارة).
- **مفيش** أي منطق حسابي أو تحقق من المخزون في الفرونت — كل ده الباك إند بيرجعه جاهز، الفرونت بس بيعرض.
- استخدم React state عادي أو أي state management خفيف (Zustand/Context) — لا تستخدم `localStorage`/`sessionStorage` لو الجزء ده هيتحول لاحقًا لـ artifact تجريبي؛ في مشروع Next.js حقيقي عادي ده مش قيد.

## معايير القبول
- [ ] تسجيل الدخول والتسجيل شغالين ومربوطين بالباك إند فعليًا (مش mock).
- [ ] كل صفحة بتعرض بيانات التينانت المسجل دخوله بس (لا تسريب بيانات تينانت تاني).
- [ ] عرض حالة اتصال الواتساب بيتحدث (ولو بـ polling بسيط) لما الحالة تتغير من `PENDING_QR_SCAN` لـ `CONNECTED`.
- [ ] جداول الأوردرات والـ ledger بتدعم على الأقل فلترة أو pagination أساسية.
-e 


---



# خطوة 13 — الاختبار الشامل (Testing Checklist)

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

**Idempotency إلزامي:** الحماية من التكرار عبر unique constraint على `source_whatsapp_message_id` (على `CustomerOrder` و`PendingSettlement`)، بيتعمل insert ليه جوه نفس الـ transaction اللي بتحدد النتيجة النهائية — مش جدول منفصل بيتعلّم عليه قبل المعالجة (تفاصيل خطوة 02/05).

**Audit trail إلزامي:** كل `CustomerOrder` وكل `LedgerEntry` مستقل لازم يتخزن معاه `source_whatsapp_message_id` و `raw_message_text`.

**Settlement confirmation إلزامي:** أي أمر تسوية مالية بيتفسّر بواسطة AI ممنوع يتنفذ فورًا — لازم يتخزن كـ `PendingSettlement` وينتظر تأكيد صريح من المدير قبل أي كتابة على `LedgerEntry` (تفاصيل خطوة 05/10).

---

## هدف الخطوة
التأكد إن كل التدفقات والقواعد المعمارية من الخطوات 01-12 شغالة فعليًا زي ما هو مطلوب، عن طريق قايمة اختبارات محددة.

## اختبارات الـ Idempotency والـ Audit Trail (جديد — إلزامي)
- [ ] بعت نفس الرسالة (نفس `whatsappMessageId`) مرتين متتاليتين → أوردر واحد بس اتسجل، مفيش تكرار في المخزون أو الـ ledger.
- [ ] كل `CustomerOrder` ناجح فيه `source_whatsapp_message_id` و `raw_message_text` مسجلين وغير فاضيين.
- [ ] كل `LedgerEntry` ناتج عن تسوية (مش مربوط بأوردر) فيه `source_whatsapp_message_id` و `raw_message_text`.

## اختبارات تأكيد التسوية (Settlement Confirmation — جديد)
- [ ] أمر تسوية جديد → بيتخزن كـ `PendingSettlement` بحالة `PENDING`، **مفيش أي `LedgerEntry` بيتسجل فورًا**.
- [ ] رد المدير بـ"تأكيد" → القيد يتسجل فعليًا، الحالة تتحول لـ `CONFIRMED`.
- [ ] رد المدير بـ"إلغاء" → مفيش قيد، الحالة تتحول لـ `REJECTED`.
- [ ] المدير ماردّش خلال المدة المحددة → الحالة تتحول لـ `EXPIRED` تلقائيًا، أي محاولة تأكيد بعد كده بترفض برسالة واضحة.

## اختبارات طبقة قاعدة البيانات
- [ ] محاولة إنشاء `TenantWhatsAppNumber` برقم موجود مسبقًا لتينانت تاني → لازم ترفض (unique constraint).
- [ ] محاولة إنشاء `InventoryProduct` بنفس الـ `sku` لنفس التينانت مرتين → لازم ترفض.
- [ ] نفس الـ `sku` مسموح بيه لتينانتين مختلفين (unique على `tenant_id + sku` مش على `sku` وحده).

## اختبارات طبقة الـ Repository
- [ ] `LedgerEntryRepository` مفيهوش method اسمها update أو delete (فحص كود ثابت، مش runtime).
- [ ] `decrementStockWithLock` مبيتنفذش إلا جوه transaction فيها `lockForUpdate` قبله.

## اختبارات تدفق الأوردر (Order Placement)
- [ ] أوردر بمخزون كافي → `CONFIRMED`، المخزون بينقص صح، قيد `DEBIT` واحد اتسجل، الفاتورة وصلت.
- [ ] أوردر بمنتج واحد من ضمن عدة منتجات مخزونه ناقص → الأوردر كله `REJECTED_INSUFFICIENT_STOCK`، **صفر** تغيير في المخزون، **صفر** قيود.
- [ ] أوردر من رقم عميل مش مسجل كتينانت (رقم مش موجود في `TenantWhatsAppNumber`) → الرسالة بتتجاهل (drop) صامتة.
- [ ] كمية مطلوبة `<= 0` → رفض فوري.
- [ ] طلبين متزامنين (concurrent) على نفس المنتج بنفس اللحظة، والمخزون يكفي واحد بس → واحد بس ينجح، التاني يترفض (اختبار الـ row-level lock فعليًا تحت ضغط).

## اختبارات تدفق التسوية (Settlement)
- [ ] أمر تسوية من رقم `AUTHORIZED_FINANCE` → قيد جديد + تحديث `FinancialLedgerSummary` + إيصال يوصل.
- [ ] أمر تسوية من رقم `PUBLIC_SALES` → **رفض قبل الوصول لـ `finance-ledger`**، صفر قيود، تسجيل log للمحاولة.
- [ ] مبلغ سالب أو صفر في أمر التسوية → رفض.
- [ ] بعد أي تسوية، `running_balance` في `FinancialLedgerSummary` بيطابق مجموع كل قيود `LedgerEntry` لنفس الطرف (إعادة حساب من المصدر، مش تراكم تدريجي).

## اختبارات الـ AI Orchestrator
- [ ] رسالة مش مفهومة (`intent = UNKNOWN`) → رد افتراضي بس، مفيش استدعاء لـ `OrderProcessorService` ولا `SettlementService`.
- [ ] تبديل `AI_PROVIDER` في `.env` من gemini لـ openai → النظام بيشتغل من غير تغيير كود.

## اختبارات العزل بين التينانتات (Multi-tenancy Isolation)
- [ ] تسجيل دخول كـ tenant A ومحاولة الوصول لأوردر بتاع tenant B عبر `/orders/:id` → رفض (404 أو 403).
- [ ] استعلام مباشر على أي endpoint بيرجع بيانات بس للتينانت المسجل دخوله، بدون استثناء.

## اختبارات الطابور (Queue Resilience)
- [ ] فصل الاتصال بـ Redis مؤقتًا وإعادته → الرسائل المتراكمة بتتعالج لما الاتصال يرجع (بدون فقدان jobs).
- [ ] فشل إرسال رسالة WhatsApp → retry تلقائي حسب إعدادات BullMQ (خطوة 06)، من غير تكرار يدوي في الكود.

## معايير القبول
- [ ] كل البنود فوق اتعملها اختبار (يدوي أو آلي) وعدّت بنجاح.
- [ ] أي بند فشل، يترجع لخطوة التنفيذ المرتبطة بيه (حسب الترقيم في `00-INDEX.md`) ويتصلّح هناك، مش بتصحيح سريع هنا.
-e 


---



# خطوة 14 — النشر (Deployment Checklist)

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

**Idempotency إلزامي:** الحماية من التكرار عبر unique constraint على `source_whatsapp_message_id` (على `CustomerOrder` و`PendingSettlement`)، بيتعمل insert ليه جوه نفس الـ transaction اللي بتحدد النتيجة النهائية — مش جدول منفصل بيتعلّم عليه قبل المعالجة (تفاصيل خطوة 02/05).

**Audit trail إلزامي:** كل `CustomerOrder` وكل `LedgerEntry` مستقل لازم يتخزن معاه `source_whatsapp_message_id` و `raw_message_text`.

**Settlement confirmation إلزامي:** أي أمر تسوية مالية بيتفسّر بواسطة AI ممنوع يتنفذ فورًا — لازم يتخزن كـ `PendingSettlement` وينتظر تأكيد صريح من المدير قبل أي كتابة على `LedgerEntry` (تفاصيل خطوة 05/10).

---

## هدف الخطوة
تجهيز المشروع للنشر الفعلي، بعد ما كل الخطوات من 01 لـ 13 خلصت واتاختبرت.

## البنية التحتية المطلوبة
- **PostgreSQL** — instance مُدار (managed) أو self-hosted، مع نسخ احتياطي (backup) دوري مفعّل من أول يوم (الـ ledger append-only فبيانات مهمة جدًا محاسبيًا).
- **Redis** — instance مُدار لطابور BullMQ.
- **Backend (Nest.js)** — يتنشر كـ container واحد أو أكتر (لو الحمل كبير ممكن تفصل الـ Worker Pool عن الـ HTTP server كـ process مستقل).
- **Frontend (Next.js)** — يتنشر على Vercel أو أي static/edge hosting مناسب.
- **Baileys sessions** — لازم persistent storage (مش ephemeral) عشان الـ sessions ماتتفصلش كل مرة السيرفر يعمل restart.

## متغيرات البيئة (Environment Variables) — قايمة كاملة
```
DATABASE_URL=
REDIS_HOST=
REDIS_PORT=
AI_PROVIDER=            # gemini | openai | local
GEMINI_API_KEY=
OPENAI_API_KEY=
JWT_SECRET=
NEXT_PUBLIC_API_BASE_URL=
```

## خطوات ما قبل النشر (Pre-launch)
- [ ] كل الاختبارات في `13-testing-checklist.md` عدّت بنجاح.
- [ ] `npx prisma migrate deploy` (مش `migrate dev`) على قاعدة بيانات production.
- [ ] مراجعة كل الـ `.env` والتأكد إن مفيش قيمة placeholder أو test key اتسابت بالغلط.
- [ ] تفعيل الـ backup الدوري لقاعدة بيانات PostgreSQL (يوميًا كحد أدنى، بالنظر لطبيعة البيانات المالية).
- [ ] مراجعة أمنية على `finance-role.guard` — تأكيد يدوي إضافي (مش بس اختبار آلي) إن مفيش مسار كود بيتخطاه.

## المراقبة (Monitoring) — حد أدنى مطلوب
- [ ] Logging مركزي لكل محاولات التسوية المرفوضة (unauthorized settlement attempts).
- [ ] تنبيه (alert) لو طابور `incoming-messages` أو `outgoing-messages` بدأ يتراكم (queue backlog) فوق حد معين.
- [ ] تنبيه لو أي session Baileys اتقطعت وفشلت في reconnect بعد عدد محاولات معين.

## بعد النشر (Post-launch)
- [ ] اختبار end-to-end حقيقي: تسجيل تينانت جديد، ربط رقم واتساب حقيقي، تنفيذ أوردر تجريبي فعلي، تسوية تجريبية فعلية.
- [ ] مراجعة أول 24-48 ساعة من الـ logs للتأكد من عدم وجود رسائل بتتوه أو تتكرر.

## معايير القبول
- [ ] المشروع شغال في production ومتاح للعملاء الحقيقيين.
- [ ] كل بند في القايمة اتعمل، مفيش بند اتقفز بسبب الاستعجال.
-e 


---



# خطوة 15 — حاجات اتأجلت بوعي (Deferred Hardening — بعد v1)

## هدف الملف
الملف ده **مش خطوة تنفيذ** زي الباقي — ده سجل واضح لحاجات اتراجعت أمنيًا/معماريًا واتقرر إنها **مش blocking لإطلاق v1**، عشان محدش (لا إنت ولا أي حد يشتغل على المشروع بعدين) يفتكر إنها اتنسيت. لما يجيلك وقت بعد الإطلاق، ارجع للملف ده وابدأ تنفذهم بالترتيب.

## ليه دول اتأجلوا ومش اللي في الخطوات التانية؟
المعيار: أي حاجة ممكن تسبب **فقدان فلوس فعلي أو نزاع مالي بدون دليل** = لازم في v1 (اتنفذت في خطوات 02، 05، 06، 09، 10 — idempotency، audit trail، settlement confirmation). أي حاجة تانية (تحسين تجربة، حماية إضافية، edge case نادر) = تقدر تستحمل التأجيل.

---

## 1. PostgreSQL Row-Level Security (RLS)
**الوضع الحالي:** العزل بين الـ tenants معتمد بالكامل على انضباط الكود (كل query لازم يتفلتر بـ `tenant_id` يدويًا في الـ repository layer).
**المخاطرة:** لو ديفلوبر (أو موديل AI بيكتب كود) نسي الفلتر في query واحد، تسريب بيانات بين tenants.
**ليه اتأجل:** مع فريق صغير وcode review دقيق، الانضباط كافي لـ MVP. RLS طبقة دفاع إضافية مش أساسية للانطلاق.
**متى تنفذه:** أول ما يكون عندك وقت بعد الإطلاق، أو أول ما الفريق يكبر ومابقاش كل كود بيتراجع يدويًا. نفّذه بـ `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + policy على كل جدول تينانت-سكوبد بيقارن `tenant_id` بـ session variable بتتحط في بداية كل request.

## 2. Fuzzy Product Matching الغامض
**الوضع الحالي:** لو `findByTenantAndName` رجّع أكتر من نتيجة قريبة، النظام بيرفض الأوردر ويطلب توضيح (اتضاف كـ سلوك إلزامي في خطوة 09).
**المؤجل فعليًا:** تحسين خوارزمية الـ matching نفسها (زي استخدام trigram similarity بدل `ILIKE` بسيط، أو ranking بالـ relevance).
**ليه اتأجل:** مع عدد منتجات محدود في MVP، احتمالية الغموض قليلة، والرفض المؤقت مقبول كسلوك.
**متى تنفذه:** لو حجم كتالوج المنتجات كبر وبدأ الرفض يحصل بكثرة فعليًا (راقب الـ logs).

## 3. Lock Ordering على أوردرات متعددة المنتجات
**الوضع الحالي:** كل منتج بياخد `lockForUpdate` منفصل داخل نفس الـ transaction، من غير ترتيب محدد.
**المخاطرة:** لو أوردرين متزامنين بيقفلوا نفس المنتجين بترتيب معكوس، ممكن يحصل deadlock.
**ليه اتأجل:** نادر الحدوث في بيزنس صغير بأوردرات محدودة العناصر، وBullMQ retry بيعالج معظم الحالات لو حصلت.
**متى تنفذه:** لو بدأت تشوف deadlock errors فعليًا في الـ logs، رتّب الأقفال دايمًا بنفس الترتيب (مثلاً بـ `product_id` تصاعديًا) قبل ما تبدأ تقفل.

## 4. تفعيل `vertical_metadata` فعليًا
**الوضع الحالي:** العمود موجود في الـ schema (JSONB) ومذكور كـ "بيتفحص في الـ service layer حسب `vertical_type`"، لكن مفيش منطق تنفيذي فعلي موصوف (زي رفض بيع دواء محتاج `requires_prescription` من غير تأكيد).
**ليه اتأجل:** ده تحسين تجربة/امتثال مش أساسي لأول نسخة تشتغل بمنتجات عادية.
**متى تنفذه:** قبل ما تفتح المنصة فعليًا لصيدليات حقيقية، لازم تحدد فعليًا إيه سلوك كل مفتاح في `vertical_metadata` وتنفذه.

## 5. JWT Refresh / Revocation التفصيلي
**الوضع الحالي:** auth أساسي بـ JWT (login بس)، من غير تفاصيل refresh tokens أو آلية revocation لو حصل تسريب.
**ليه اتأجل:** أساسيات auth كافية لداشبورد MVP بعدد مستخدمين قليل.
**متى تنفذه:** قبل ما تفتح تسجيل عام للعملاء، ضيف refresh token rotation + قدرة تلغي جلسة معينة.

## 6. سقف أقصى لمبلغ التسوية / تنبيه للمبالغ الكبيرة
**الوضع الحالي:** خطوة 10 بتضيف تأكيد إلزامي لأي تسوية (بغض النظر عن المبلغ) — ده الحد الأدنى المطلوب.
**المؤجل فعليًا:** سقف قابل للتهيئة لكل tenant (مثلاً "أي مبلغ فوق 10,000 جنيه محتاج تأكيد إضافي من رقم تاني" أو تنبيه منفصل للمالك)، بدل تأكيد واحد موحّد لكل المبالغ.
**متى تنفذه:** أول ما يبقى عندك بيانات كافية عن حجم التسويات الطبيعي لكل تينانت، وتقدر تحدد عتبة معقولة.

## 7. تمييز رد التأكيد عن رسالة عادية جديدة (Settlement Confirmation Disambiguation)
**الوضع الحالي:** لو المدير عنده `PendingSettlement` نشط وبعت رسالة جديدة، النظام بيفحص كلمات مفتاحية بسيطة الأول ("تأكيد"/"أيوه"/"موافق" أو "إلغاء"/"لأ"/"رفض") قبل أي تصنيف AI تاني. لو الرسالة متطابقتش مع أي كلمة مفتاحية، الـ `PendingSettlement` بيتسيب زي ما هو (لا تأكيد ولا رفض) لحد ما ينتهي وقته أو يرد بوضوح.
**المخاطرة:** لو المدير كتب رد بصياغة غامضة ("تمام كده" أو "خليها كده")، النظام ممكن ميفهمهاش كتأكيد صريح، فالتسوية تستنى لحد ما تنتهي، والمدير يحتاج يبعت "تأكيد" صريحة تاني.
**ليه اتأجل:** الأثر أسوأ سيناريو مزعج (تجربة استخدام)، مش خطر مالي — مفيش قيد بيتسجل غلط، بس ممكن يتأخر تسجيله.
**متى تنفذه:** لو لاحظت إن نسبة كبيرة من التسويات بتنتهي `EXPIRED` بسبب ردود غامضة، وسّع قائمة الكلمات المفتاحية أو استخدم AI classification مخصص لفهم نية الرد (accept/reject/unclear) بدل matching حرفي بسيط.

## 8. فشل إرسال رسالة طلب التأكيد نفسها (مش الإيصال النهائي)
**الوضع الحالي:** لو رسالة "تأكيد التسوية؟" (خطوة 14ب في `10-settlement-flow.md`) فشلت توصل للمدير لأي سبب (مشكلة شبكة، مشكلة في جلسة Baileys)، مفيش آلية خاصة لإعادة إرسالها بخلاف الـ retry العادي بتاع BullMQ على `outgoing-messages`.
**المخاطرة:** لو الـ retry العادي مانفعش، الـ `PendingSettlement` هيفضل معلّق لحد ما ينتهي وقته (`EXPIRED`) والمدير مايعرفش إن فيه أمر مستني تأكيده أصلًا.
**ليه اتأجل:** مفيش فلوس اتحركت في السيناريو ده — أسوأ حاجة إن المدير يضطر يبعت الأمر تاني من الأول. مزعج بس مش خطير ماليًا.
**متى تنفذه:** لو حصل بشكل متكرر فعليًا، ضيف تنبيه على الداشبورد (خطوة 12) بأي `PendingSettlement` قارب على الانتهاء من غير رد، عشان المدير يقدر يتابعها من واجهة تانية غير الواتساب نفسه.

## 9. Monitoring/Alerting على معدل الـ `EXPIRED` في `PendingSettlement`
**الوضع الحالي:** لو نسبة كبيرة من التسويات بتنتهي `EXPIRED` (المدير ماردّش خلال الوقت المحدد)، مفيش أي تنبيه تلقائي — لازم حد يدوّر في القاعدة بنفسه عشان يلاحظ المشكلة.
**المخاطرة:** مؤشر مشكلة حقيقية (رسايل مش بتوصل، أو المديرين مش فاهمين يردوا إزاي) ممكن يفضل مخفي لفترة طويلة.
**ليه اتأجل:** مش خطر مالي مباشر — التسويات المنتهية مفيهاش قيود مسجلة غلط، بس تجربة استخدام سيئة لو تكررت.
**متى تنفذه:** أول ما يبقى عندك مستخدمين حقيقيين، ضيف alert بسيط (يومي أو أسبوعي) بعدد الـ `PendingSettlement` اللي اتحولت `EXPIRED` لكل tenant، ولو النسبة عالية حقّق في السبب (شبكة، فهم المستخدم، صياغة الرسالة).

---
لو حد (إنت أو موديل تاني) شاف مشكلة في الدوكيومنتيشن أثناء التنفيذ وقرر "دي مش أولوية دلوقتي"، الملف ده هو المكان الصح ليها — مش تتجاهل بصمت. ضيفها كبند جديد بنفس الشكل (الوضع الحالي / المخاطرة / ليه اتأجل / متى تنفذه).
-e 


---



