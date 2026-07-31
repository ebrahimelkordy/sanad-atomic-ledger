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
