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
