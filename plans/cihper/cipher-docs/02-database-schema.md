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
