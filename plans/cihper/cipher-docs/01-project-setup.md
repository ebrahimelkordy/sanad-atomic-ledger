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
