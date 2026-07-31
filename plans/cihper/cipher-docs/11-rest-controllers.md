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
