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

---

## مراجعة مرجعية الجودة — المرحلة 3 (2026-07-13)

### التقييم المختصر
المرحلة 3 غير مكتملة من ناحية التنفيذ الفعلي. يوجد هيكل ملفاتRepository جاهز من حيث الاسم، لكن المحتوى الحقيقي لكل repository ما زال فارغًا.

### ما الذي تم التحقق منه
- تم فحص ملفات المرحلة 3 في [apps/backend/src/repositories](apps/backend/src/repositories).
- تم التأكد من أن الملفات الأساسية موجودة، لكنها لا تحتوي على أي تنفيذ عملي.
- تم تشغيل البناء الخلفي بنجاح، لكن هذا لا يكفي لإثبات تنفيذ المرحلة 3.

### الحكم النهائي
- خطة المرحلة 3: غير مكتملة.
- الحالة الحالية: هيكل مبدئي فقط، بدون طبقة Repository عملية جاهزة للاستخدام.
- المطلوب: تنفيذ repositories فعليًا، مع الالتزام بالمعمارية والـ methods المحددة في [plans/03-repository-layer.md](plans/03-repository-layer.md).
