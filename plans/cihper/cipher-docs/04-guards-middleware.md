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
