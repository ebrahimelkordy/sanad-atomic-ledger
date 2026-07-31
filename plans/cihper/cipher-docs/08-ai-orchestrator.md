# خطوة 08 — AI Orchestrator & Provider Abstraction

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
بناء طبقة تجريد (abstraction) فوق أي موديل AI، بحيث تقدر تبدّل بين Gemini وOpenAI وموديل محلي من غير ما تلمس أي كود تاني في المشروع.

## الـ Interface الأساسي

```ts
interface AIProvider {
  classifyAndExtract(
    messageText: string,
    tenantContext: { verticalType: string; tenantId: string },
  ): Promise<{
    intent: 'ORDER' | 'SETTLEMENT' | 'UNKNOWN';
    extractedData: Record<string, any>;
  }>;
}
```

## المنفذين المطلوبين (بالظبط التلاتة دول، مفيش رابع)

### `GeminiProvider implements AIProvider`
- بينادي Gemini API بالـ API key من `.env` (`GEMINI_API_KEY`).
- برومبت مبني على `vertical_type` بتاع التينانت (برومبت مختلف للمطعم عن الصيدلية عن الريتيل).

### `OpenAIProvider implements AIProvider`
- نفس الـ interface، لكن بيستخدم OpenAI SDK و `OPENAI_API_KEY`.

### `LocalModelProvider implements AIProvider`
- نفس الـ interface، لموديل محلي (self-hosted). التفاصيل الدقيقة لتشغيل الموديل المحلي (docker، endpoint، إلخ) تتحدد وقت التنفيذ الفعلي — المهم إنه يلتزم بنفس الـ interface بالظبط.

## اختيار الـ Provider
- المتغير `AI_PROVIDER` في `.env` (قيمته `gemini` | `openai` | `local`) بيحدد الـ provider النشط.
- ممكن يتحدد **لكل tenant** بدل ما يبقى global واحد (لو حابب مرونة أكتر، ضيف عمود اختياري على `Tenant` — لكن ده تغيير schema فبيتطلب migration جديدة، ميتعملش من غير موافقة صريحة).
- الاختيار بيحصل جوه `AIOrchestrationService` (خطوة 05) عبر factory بسيطة:
  ```ts
  function getAIProvider(providerName: string): AIProvider {
    switch (providerName) {
      case 'gemini': return new GeminiProvider(...);
      case 'openai': return new OpenAIProvider(...);
      case 'local': return new LocalModelProvider(...);
    }
  }
  ```

## قاعدة صارمة (تتكرر من الـ context العام)
- **الاستدعاء الوحيد المسموح** لأي AI SDK (Gemini/OpenAI/local) هو من جوه الملفات التلاتة دي بالظبط. أي كود في `sales-automation` أو `finance-ledger` أو أي مكان تاني عايز يستخدم AI لازم يعدّي من `AIOrchestrationService.classifyAndExtract` بس.

## المخرجات المتوقعة من `classifyAndExtract`
- **لو `intent = 'ORDER'`**: `extractedData` لازم يحتوي array من `{ productNameOrSku, quantity }` — ده اللي بيتبعت لـ `OrderProcessorService.processOrder` (خطوة 05/09).
- **لو `intent = 'SETTLEMENT'`**: `extractedData` لازم يحتوي `{ partyIdentifier, entryType, amount }` — ده اللي بيتبعت لـ `SettlementService.settleAccount` (خطوة 05/10).
- **لو `intent = 'UNKNOWN'`**: الرسالة بترفض بردّ افتراضي ("معرفتش أفهم طلبك") من غير أي معالجة تانية.

## بنية الملفات
```
apps/backend/src/ai-orchestrator/
  ai-provider.interface.ts
  gemini.provider.ts
  openai.provider.ts
  local-model.provider.ts
  ai-provider.factory.ts
```

## معايير القبول
- [ ] الثلاث Providers بيطبّقوا نفس الـ `AIProvider` interface بالظبط.
- [ ] تبديل الـ provider بيحصل بتغيير `.env` بس، من غير أي كود تاني يتغيّر.
- [ ] مفيش أي استدعاء مباشر لـ Gemini/OpenAI SDK من بره الملفات الثلاثة دي.
- [ ] المخرجات متوافقة تمامًا مع الشكل المطلوب من `OrderProcessorService` و `SettlementService`.
