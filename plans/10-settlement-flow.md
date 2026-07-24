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
