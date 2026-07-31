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
