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
