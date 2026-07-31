import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  GenerativeModel,
  Part,
} from '@google/generative-ai';
import {
  AIProvider,
  ClassifyAndExtractResult,
  TenantAIContext,
  ProcessChatResult,
} from './ai-provider.interface';

@Injectable()
export class GeminiProvider implements AIProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private visionModel: GenerativeModel;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY') || '';
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    this.visionModel = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
    });
  }

  async classifyAndExtract(
    messageText: string,
    tenantContext: TenantAIContext,
  ): Promise<ClassifyAndExtractResult> {
    const prompt = `You are an AI assistant for a business of type: ${tenantContext.verticalType}.
Analyze the following WhatsApp message from a customer or manager.
Classify the intent into one of three categories: "ORDER", "SETTLEMENT", or "UNKNOWN".

If the intent is "ORDER", extract the items requested.
If the intent is "SETTLEMENT", extract the FULL party identifier (name or phone — NEVER shorten!), the entry type ("CREDIT" or "DEBIT"), and the amount.

Return ONLY a valid JSON object with:
{
  "intent": "ORDER" | "SETTLEMENT" | "UNKNOWN",
  "extractedData": {
    "items": [{"productNameOrSku": "string", "quantity": 1}],
    "partyIdentifier": "string (FULL NAME)",
    "entryType": "CREDIT" | "DEBIT",
    "amount": 0
  }
}

Message: "${messageText}"`;

    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      });
      const responseText = result.response.text();
      const parsed = JSON.parse(responseText) as ClassifyAndExtractResult;
      return parsed;
    } catch (e) {
      this.logger.error('Gemini classifyAndExtract failed', e);
      return { intent: 'UNKNOWN', extractedData: {} };
    }
  }

  async processChat(
    messageText: string,
    tenantContext: TenantAIContext,
    attachments?: Array<{ mimeType: string; base64Data: string }>,
  ): Promise<ProcessChatResult> {
    const systemPrompt = `أنت مساعد ذكي لنظام إدارة أعمال اسمه "سند".
نوع نشاط التاجر: ${tenantContext.verticalType}.

=== التصنيفات (14 intent):
- ADD_INVENTORY: إضافة منتج للمخزون (طقم مفكات ألماني بسعر 350 الكود بتاعه Tool-01 / 5 كراتين محولات 12 فولت الكرتونة فيها 10 القطعة القطاعي 150 كود PWR-12)
- SALE / ORDER: بيع أو أوردر بيع
- SETTLEMENT: تسوية مالية (دفعة / مديونية / خصم للعميل / سداد مورد). استلمنا X من Y تحت الحساب = CREDIT لـ "Y" كامل. خصم للعميل = DEBIT. باقي فاتورة مؤجل = DEBIT. سداد مورد (حولنا للمورد س Y) = DEBIT لـ Y.
- EXPENSE: مصروف فعلي فقط (فاتورة كهرباء / غداء عمال / شحن بنزين / هالك وتالف) — المنتجات للسحوبات والعهدة والسلفة والمخزون مش مصروفات أبداً.
- RETURN_TO_INVENTORY: إرجاع منتج للمخزن
- ADD_EMPLOYEE: إضافة موظف (عامل جديد اسمه (عاطف الشرقاوي) وظيفته فني كهرباء ورقم تليفونه 01xxxxxxx). لا تحذف رقم التليفون (احفظه في حقل phone)، ولا تحسبه كمبلغ لأي شيء.
- EMPLOYEE_ATTENDANCE: حضر (PRESENT) / غاب (ABSENT) / متأخر أو استأذن خلاص الساعة 2 (HALF_DAY) / غاب بدون إذن (ABSENT + خصم يوم DEDUCTION)
- EMPLOYEE_ADVANCE: سلفة / مكافأة / خصم لموظف
- INVENTORY_WITHDRAWAL: عهدة ومسحوبات موظف من المخزون (موظف X أخذ 2 محول وطقم شانيور — لازم استخرج كل منتج في withdrawal لوحده).
- ADD_CUSTOMER: إضافة عميل / مورد جديد
- SERVICE_ORDER: افتح طلب خدمة / صيانة جديد (اسم، تصنيف، أولوية، فني رئيسي، مساعد).
- MULTI_ACTION: أكثر من أمر
- UNKNOWN

=== القواعد الإلزامية (مهم جدًا):
1. رد بالعربي
2. **أسماء كاملة ولا تقطع أبدًا**: "شركة الأمل" لا تُقطع "الع"، "أستاذ سامح" كامل، "شركة التقنية" كامل، "مدير الفندق أستاذ سامح" → الطرف هو "أستاذ سامح" (أضف كلمة أستاذ كجزء من الاسم).
3. **الترتيب الإجباري للأوامر**: ADD_EMPLOYEE → ADD_CUSTOMER → ADD_INVENTORY → EMPLOYEE_ATTENDANCE → INVENTORY_WITHDRAWAL → SALE → EMPLOYEE_ADVANCE → SETTLEMENT → EXPENSE → RETURN_TO_INVENTORY → SERVICE_ORDER
4. لو ذكر اسم موظف/عميل في أي أمر ومش موجود في الإضافات → أضف ADD_EMPLOYEE / ADD_CUSTOMER أولًا تلقائيًا.
5. **الـ aliases (أهم شيء)**: "أبو علي (اللي هو سيف الدين)" → الحقيقي هو "سيف الدين" و"أبو علي" alias بيه (استخدم سيف الدين دائماً كاسم أساسي). "الأسطة عاطف ده" = عاطف الشرقاوي اللي اتضاف قبل كده. "الأسطة" و"أستاذ" و"باشا" و"ابو/أبو" و"عم" و"ده/دي" كلها titles تشال من الاسم. "حضر بس" = الفعل حضر + بس (بس مش جزء من الاسم اطلاقاً).
6. **الـ clauses المعقدة**: لو جملة واحدة فيها أكتر من فعل (حضر + سلفة، أو عهدة + رجوع + بديل + هالك) → افصلها لأكتر من action. مهم جدًا: لو فيه "أخذ X و Y وبعد رجّع X وسحب بداله وتالف" → استخرج (1) مسحوبات X و Y، (2) إرجاع X، (3) بديل/مسحوبة X الجديدة، (4) هالك/تالف X. لا تحذف المسحوبات الأصلية.
7. **أرقام التليفون**: أي رقم يبدأ بـ 01 وطوله 11 رقم = تليفون. تزود في الـ ADD_EMPLOYEE / ADD_CUSTOMER في phone. لا تحسبه أبدًا كمبلغ لأي EXPENSE أو ADVANCE أو SETTLEMENT.
8. **الأفرتايم**: "حضر وأخد 3 ساعات أفرتايم" = EMPLOYEE_ATTENDANCE PRESENT فقط (الأفرتايم مكافأة مضافة لاحقاً حسب النظام).
9. **الـ wholesale / قطاعي في المخزون**: "5 كراتين محولات 12 فولت الكرتونة فيها 10 قطع سعر شراء الكرتونة 1200 وسعر بيع القطعة القطاعي 150" → الكمية = 50 قطعة، cost_price للقطعة = 120 (1200 / 10)، unit_price = 150. كود المنتج = PWR-12.
10. **التالف / الهالك / Scrap**: "محول تالف سجله في الهالك" = EXPENSE expenseCategory: "أخرى" مع ملاحظة "هالك/تالف" لو أمكن.
11. **دفعة + خصم + باقي مؤجل في نفس الفقرة**: افصل 3 تسويات منفصلة (كلهم لنفس الطرف): (1) دفعة سداد CREDIT بمبلغ 4000، (2) خصم / حسم DEBIT بمبلغ 200، (3) باقي فاتورة مؤجل DEBIT بمبلغ 1500.
12. **سداد مورد عن طريق فودافون كاش**: "حولنا للمورد شركة التقنية 3000 من حساب فودافون كاش سداد جزء من الشحنة القديمة" → الطرف هو "شركة التقنية"، entryType = DEBIT (سداد مورد)، amount = 3000.
13. **طلب الخدمة (SERVICE_ORDER)**: استخرج منه title (اسم الخدمة)، category (التصنيف)، priority (الأولوية: عاجل/عادي)، leadTechnician (الفني الرئيسي)، assistantTechnician (المساعد).

الرسالة: "${messageText}"`;

    const parts: Part[] = [{ text: systemPrompt }];
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        parts.push({ inlineData: { mimeType: att.mimeType, data: att.base64Data } });
      }
    }

    try {
      const result = await this.visionModel.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json' },
      });
      const parsed = JSON.parse(result.response.text());
      return this.normalizeActionsOrder(parsed);
    } catch (error) {
      this.logger.error('Gemini failed, using heuristic fallback', error);
      return this.heuristicChatFallback(messageText);
    }
  }

  private normalizeActionsOrder(parsed: any): ProcessChatResult {
    const order = [
      'ADD_EMPLOYEE', 'ADD_CUSTOMER', 'ADD_INVENTORY',
      'EMPLOYEE_ATTENDANCE', 'INVENTORY_WITHDRAWAL',
      'SALE', 'ORDER', 'EMPLOYEE_ADVANCE',
      'SETTLEMENT', 'EXPENSE', 'RETURN_TO_INVENTORY',
      'SERVICE_ORDER', 'UNKNOWN',
    ];

    if (parsed.intent === 'MULTI_ACTION' && Array.isArray(parsed.extractedData?.actions)) {
      const actions = parsed.extractedData.actions;
      actions.sort((a: any, b: any) => {
        const ia = order.indexOf(a.intent);
        const ib = order.indexOf(b.intent);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
      const numList = actions
        .map((a: any, i: number) => `${i + 1}. ${a.description || a.intent}`)
        .join('\n');
      parsed.reply = `فهمت الرسالة واستخرجت منها ${actions.length} أوامر:\n${numList}\n\nيرجى تأكيد التنفيذ.`;
    }
    return {
      intent: parsed.intent || 'UNKNOWN',
      extractedData: parsed.extractedData || {},
      reply: parsed.reply || 'تم استلام رسالتك.',
      requiresConfirmation: parsed.requiresConfirmation ?? false,
    };
  }

  private static readonly EMPLOYEE_NAME_TITLES = /^(?:الأسطة|الأستاذ|الست|ابو|أبو|عم|باشا|مستر|مدير|الخا|الخ|م\.|الأ)\s+/;
  private static readonly DEMONSTRATIVES = /\s+(?:ده|دي|دا|هذا|هذه|ذلك|تلك|اللي)\s*$/;

  private extractPhone(text: string): string | undefined {
    const m = text.match(/(?<!\d)(?:01[0125]\d{8}|02\d{8,9}|\+201[0125]\d{8})(?!\d)/);
    return m ? m[0] : undefined;
  }

  private isPhone(numStr: string): boolean {
    return /^01[0125]\d{8}$|^02\d{8,9}$/.test(numStr);
  }

  private parseMoneyAmount(clause: string): { amount: number; matchText: string } {
    const allNumbers = Array.from(
      clause.matchAll(/(\d+(?:\.\d+)?)(?:\s*(?:جنيه|ج\.م|ج|دولار|ليرة))?/g),
    );
    for (const m of allNumbers) {
      const num = m[1];
      if (!this.isPhone(num)) {
        const am = parseFloat(num);
        if (am > 0 && am < 1e9) return { amount: am, matchText: m[0] };
      }
    }
    return { amount: 0, matchText: '' };
  }

  private cleanEmployeeName(raw: string): string {
    let name = raw.trim();
    name = name.replace(GeminiProvider.EMPLOYEE_NAME_TITLES, '');
    name = name.replace(GeminiProvider.DEMONSTRATIVES, '');
    name = name.replace(/\s+/g, ' ').trim();
    name = name.replace(/^[،,\sو]+|[،,\sو]+$/g, '');
    return name;
  }

  private splitIntoClauses(text: string): string[] {
    let workText = text;
    const placeholders: Record<string, string> = {};
    let phCounter = 0;
    const placeholderRe = /\u0000(\d+)\u0000/g;

    function protect(re: RegExp, s: string): string {
      return s.replace(re, (match) => {
        const key = `\u0000${phCounter++}\u0000`;
        placeholders[key] = match;
        return key;
      });
    }

    workText = protect(/\([^()]*\)/g, workText);
    workText = protect(/\[[^\]]*\]/g, workText);
    workText = protect(/"[^"]*"/g, workText);
    workText = protect(/'[^']*'/g, workText);

    const sectionHeaderRe = /(?:^|[\s،,.:؛;])\s*(أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|أخيراً|بالنسبة\s*لـ?)\s*[^:،,]*?\s*[:：]/g;
    const sectionRanges: Array<{ start: number; end: number }> = [];
    let sm: RegExpExecArray | null;
    const sectionScanner = new RegExp(sectionHeaderRe.source, sectionHeaderRe.flags);
    while ((sm = sectionScanner.exec(workText)) !== null) {
      const start = sm.index === 0 ? sm.index : sm.index + 1;
      sectionRanges.push({ start, end: sm.index + sm[0].length });
    }
    const SEG_MARKER = '\u0003SEG\u0003';
    for (let i = sectionRanges.length - 1; i >= 0; i--) {
      const { start, end } = sectionRanges[i];
      workText = workText.slice(0, start) + ' ' + SEG_MARKER + ' ' + workText.slice(end);
    }

    let stage1 = workText.split(/\s*(?:[.۔\n\r\u2028\u2029؛;]|(?=\u0003SEG\u0003))\s*/).map((s) => s.trim());
    stage1 = stage1.filter((s) => s.length > 0 && s !== SEG_MARKER);

    const segments: string[][] = [];
    let currentSeg: string[] = [];
    for (const part of stage1) {
      if (part.includes(SEG_MARKER)) {
        const chunks = part.split(SEG_MARKER).map((c) => c.trim()).filter((c) => c.length > 0 && c !== SEG_MARKER);
        if (currentSeg.length > 0) { segments.push(currentSeg); currentSeg = []; }
        for (const c of chunks) {
          if (currentSeg.length > 0) { segments.push(currentSeg); currentSeg = []; }
          currentSeg.push(c);
        }
      } else {
        if (part.length > 0) currentSeg.push(part);
      }
    }
    if (currentSeg.length > 0) segments.push(currentSeg);

    const prefixesRe = /(?:وسجل|وكمان|واخصم|وسأضف|ور[جچ]ّ?ع|وحول|ونحوّل|وادفع|و[أإا]?ضف|و[أإا]?خذ|و[أإا]خد|وبعد\s+ساعة|وبعد|وسحب|و[أإا]?ستلم|وأخيراً|وبعدها|وعملنا|وتستحق|وافتح|وعيّن|وشحنا|واصرفنا|وصرفنا|وكان|وكانت|وطالع|وطلع)\s+/g;
    const protectedConjunctions = [
      'ووظيفته', 'ووظيفة', 'واسمه', 'وباسم', 'بوظيفة', 'وعشان', 'عشان', 'وبس', 'وظيفته',
      'واحد جديد', 'وفودافون كاش', 'و 2 محول', 'و 2 محولات', 'وبس بعد', 'بس بعد ساعة',
      'رئيسي وسيف', 'عاطف كفني رئيسي', 'فني رئيسي وسيف', 'و رقم تليفونه', 'ورقم تليفونه',
      'وراتبه', 'وراتب', 'وسعره', 'وسعر', 'والمبلغ', 'و المبلغ', 'والباقي', 'و الباقي',
      'فني كهرباء', 'فني صيانة',
    ];

    const allClauses: string[] = [];
    for (const seg of segments) {
      const segJoined = seg.join(' ').trim();
      if (segJoined.length < 2) continue;

      let safe = segJoined;
      const localPh: Record<string, string> = {};
      for (const w of protectedConjunctions) {
        if (safe.includes(w)) {
          const k = `\u0004${Object.keys(localPh).length}\u0004`;
          localPh[k] = w;
          safe = safe.split(w).join(k);
        }
      }

      const splitParts: string[] = [];
      let lastIndex = 0;
      const re = new RegExp(prefixesRe.source, prefixesRe.flags);
      let pm: RegExpExecArray | null;
      while ((pm = re.exec(safe)) !== null) {
        if (pm.index > lastIndex) {
          splitParts.push(safe.slice(lastIndex, pm.index).trim());
        }
        lastIndex = pm.index + pm[0].length;
      }
      if (lastIndex < safe.length) splitParts.push(safe.slice(lastIndex).trim());
      const partsAfterPrefix = splitParts.length > 0 ? splitParts : [safe];

      const restoredParts: string[] = [];
      for (const p of partsAfterPrefix) {
        let r = p;
        for (const [lk, lv] of Object.entries(localPh)) r = r.split(lk).join(lv);
        r = r.replace(/^[،,\sو]+/, '').trim();
        if (r.length > 0) restoredParts.push(r);
      }

      const multiEventMarkers: Array<{ re: RegExp; min: number }> = [
        { re: /(حضر|غاب|غياب|متأخر|استأذن)/g, min: 1 },
        { re: /(سلفة|خصم|مكافأة)/g, min: 1 },
        { re: /(أخذ|اخد|أخد|عهدة)/g, min: 1 },
      ];
      for (const clause of restoredParts) {
        const hasEvents = clause.length >= 40 && multiEventMarkers.some(({ re, min }) => {
          const m = clause.match(re);
          return m && m.length > min;
        });
        const hasAliases = /\u0000\d+\u0000/.test(clause) && clause.length > 40;
        const hasReturnChain = /رجّع|ارجع|إرجاع|رجع|يرجع/.test(clause) && /أخذ|اخد|أخد|عهدة|مسحوبة|سحب/.test(clause);
        if (hasEvents || hasAliases || hasReturnChain) {
          const subParts = clause.split(/[،,]\s*(?=\S)/);
          let buf = '';
          for (let i = 0; i < subParts.length; i++) {
            let p = subParts[i].trim().replace(/^[،,\sو]+/, '').replace(/[،,\s]+$/, '');
            const continuationRe = /^(?:بس|لأن|عشان|بعد|وبعد|لكن|وطالع|وطلع|وسجل|وسحب|وطلع|محروق|تالف|محروق وسحب|عشان طلع)/;
            if (buf && (continuationRe.test(p) || p.length < 4)) {
              buf += '، ' + p;
              continue;
            }
            if (buf.length > 3) allClauses.push(buf);
            buf = p;
          }
          if (buf.length > 3) allClauses.push(buf);
        } else {
          if (clause.length > 3) allClauses.push(clause);
        }
      }
    }

    function restore(s: string): string {
      let r = s;
      let maxIt = 10;
      while (placeholderRe.test(r) && maxIt-- > 0) {
        r = r.replace(placeholderRe, (_m, idx) => placeholders[`\u0000${idx}\u0000`] || '');
      }
      r = r.split(SEG_MARKER).join(' ').replace(/\s+/g, ' ').trim();
      return r;
    }

    const merged: string[] = [];
    for (const raw of allClauses) {
      let cleaned = raw.replace(/^[،,\s:：]+|[،,\s:：]+$/g, '').trim();
      cleaned = cleaned.replace(/^[و]\s+/, '').trim();
      cleaned = cleaned.split(SEG_MARKER).join(' ').replace(/\s+/g, ' ').trim();
      if (cleaned.length < 4) continue;

      const looksSkuOnly = /^(?:كود|SKU|الكود)\b/i.test(cleaned) && cleaned.length < 60;
      const prev = merged.length > 0 ? merged[merged.length - 1] : '';
      const prevIsInventory = /(?:كراتين|كرتون|شحنة|مخزن|محول|شانيور|طقم|قطعة|سعر شراء|سعر بيع|بسعر شراء|بسعر بيع|كود|SKU|دخلنا)/i.test(prev);

      if (looksSkuOnly && prevIsInventory) {
        merged[merged.length - 1] = prev + '، ' + cleaned;
        continue;
      }

      const partyPronounsRe = /\b(?:له|لها|لي|لك|لهم|لهن|لنا|بهم|بيه|بها|فيه|فيها)\b/;
      const strongPartyRe = /(?:من\s+|للمورد|للعامل|لموظف|لمدير|للعميل|(?:أستاذ|باشا|شركة|فندق|الأسطة|عميل|مورد|موظف|عامل|مدير))/;
      const looksOrphanSettlement =
        cleaned.length < 160 &&
        !strongPartyRe.test(cleaned) &&
        /(?:باقي|مؤجل|متبقي|تستحق|مستحق|خصم|حسم|بسبب|له|لها)/.test(cleaned);
      const prevHasParty = strongPartyRe.test(prev) || /من\s+['"']?/.test(prev);
      const prevIsSettlement = /(?:دفعة|تحت الحساب|استلمنا|حولنا|استلم|دفع|سداد|خصم|تسوية|حسم)/.test(prev);
      if (looksOrphanSettlement && prevHasParty && prevIsSettlement) {
        merged[merged.length - 1] = prev + '، ' + cleaned;
        continue;
      }

      const looksPhoneOnly = /^01[0125]\d{8}$|^02\d{8,9}$|^رقم\s*(?:تليفون|تليفونه|تليفونها|موبايل|هاتف)?\s*01[0125]\d{8}$/.test(cleaned);
      const prevIsAddEmployee = /(?:عامل جديد|موظف جديد|فني جديد|اسمه|باسم|وظيفته|وظيفة|موظف|عامل)/.test(prev);
      if (looksPhoneOnly && prevIsAddEmployee) {
        merged[merged.length - 1] = prev + '، ' + cleaned;
        continue;
      }

      const looksServiceSubField =
        /^(?:التصنيف|الأولوية|الفني|المساعد|عيّن\s+له|عين\s+له|الفني\s+الرئيسي|عنوان|الاسم)/.test(cleaned);
      const prevIsServiceOrder = /(?:طلب\s+خدمة|صيانة|افتح\s+طلب|SERVICE)/.test(prev);
      if (looksServiceSubField && prevIsServiceOrder) {
        merged[merged.length - 1] = prev + '، ' + cleaned;
        continue;
      }
      const looksServiceSubField2 = /^(?:تصنيف|أولوية|فني رئيسي|مساعد|عيّن|عين):/.test(cleaned);
      if (looksServiceSubField2) {
        const pprev = merged.length >= 2 ? merged[merged.length - 2] : '';
        const pprevIsService = /(?:طلب\s+خدمة|صيانة|افتح\s+طلب)/.test(pprev);
        const prevIsServiceTitle = /^(?:.*صيانة|.*خدمة|.*فندق)/.test(prev) && prev.length < 200;
        if (pprevIsService) {
          merged[merged.length - 2] = pprev + '، ' + prev + '، ' + cleaned;
          merged.pop();
          continue;
        } else if (prevIsServiceTitle && merged.length > 0) {
          merged[merged.length - 1] = prev + '، ' + cleaned;
          continue;
        }
      }

      const looksOvertimeOnly =
        cleaned.length < 80 &&
        /(?:ساعات|ساعة)\s*\d*\s*(?:أفرتايم|اوفير تايم|اضافي|إضافي)/.test(cleaned);
      const prevIsAttendance = /(?:حضر|غاب|غياب|متأخر|استأذن|حضور)/.test(prev);
      if (looksOvertimeOnly && prevIsAttendance) {
        merged[merged.length - 1] = prev + '، ' + cleaned;
        continue;
      }

      if (looksSkuOnly && merged.length >= 2) {
        const pprev = merged[merged.length - 2];
        const pprevIsInventory = /(?:كراتين|كرتون|شحنة|مخزن|محول|شانيور|طقم|قطعة|دخلنا)/i.test(pprev);
        if (pprevIsInventory) {
          merged[merged.length - 2] = pprev + '، ' + merged[merged.length - 1] + '، ' + cleaned;
          merged.pop();
          continue;
        }
      }

      merged.push(cleaned);
    }

    const finalResult = merged.map((c) => restore(c)).filter((c) => {
      const t = c.trim();
      if (t.length < 4) return false;
      if (/^(?:أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|أخيراً)$/.test(t)) return false;
      return true;
    });

    return finalResult;
  }

  private extractEmployeeFromClause(clause: string): {
    name: string; jobTitle: string; baseRate: number; salaryType: 'DAILY' | 'MONTHLY'; autoAttendance: boolean; phone?: string;
  } | null {
    const phone = this.extractPhone(clause);
    const textNoPhone = clause.replace(/01[0125]\d{8}|02\d{8,9}|\+201[0125]\d{8}/g, ' ');

    const aliasCanonical = textNoPhone.match(/\(\s*(?:اللي\s*هو|يعني|أي)\s*([\u0600-\u06FF\sA-Za-z]{3,50}?)\s*\)/);
    const canonName = aliasCanonical ? aliasCanonical[1].trim() : '';

    const parenMatch = textNoPhone.match(/[(\u0028\u061C]([\u0600-\u06FF\sA-Za-z]{3,50}?)[)\u0029\u061D]/);
    const namedMatch = textNoPhone.match(/(?:اسمه|باسم|اسم)\s*[(\u0028]?\s*([\u0600-\u06FF\sA-Za-z]{3,50}?)\s*[)\u0029]?\s*(?:ووظيفته|وظيفته|بوظيفة|وظيفة|مساعد|فني|عامل|مدير|خزينة|سائق|كاشير|محاسب)/);
    const jobMatch = textNoPhone.match(/(?:وظيفته|بوظيفة|وظيفة)\s*["'\u201C]?\s*([\u0600-\u06FF\sA-Za-z0-9]{2,30}?)\s*["'\u201D]?(?:\s+و|$|\s+راتب|\s+بسعر|\s+[،,]|\s+رقم|\s+تليفون)/);
    const jobQuickMatch = textNoPhone.match(/(مساعد|فني\s*كهرباء|فني\s*صيانة|فني|عامل|مدير|محاسب|كاشير|سائق|خزينة|مندوب|مهندس)/);
    const rateMatch = textNoPhone.match(/راتب\s*(?:شهري|يومي)?\s*(\d+)|ب[ـ\-]?(\d+)\s*(?:جنيه|ج\.م)/);
    const isMonthly = /شهري|شهرياً|شهر/.test(textNoPhone);

    let name = '';
    if (canonName) name = canonName;
    if (!name && parenMatch && !/\b(?:اللي\s*هو|يعني|أي)\b/.test(parenMatch[0])) name = parenMatch[1].trim();
    if (!name && namedMatch) name = namedMatch[1].trim();
    if (!name) {
      const generic = textNoPhone.match(/(?:موظف|عامل|فني|مساعد|مدير|مهندس|سائق|محاسب)[\sا]+(?:جديد|تاني)[\s,:]*([\u0600-\u06FF\sA-Za-z]{3,50}?)(?=\s+ووظيفته|\s+وظيفته|\s+بوظيفة|\s+راتب|\s+رقم|\s+تليفون|\s*$|\s+[،,])/);
      if (generic && generic[1]) name = generic[1].trim();
    }
    name = this.cleanEmployeeName(name);
    if (name.length < 2) return null;

    let jobTitle = '';
    if (jobMatch && jobMatch[1]) jobTitle = jobMatch[1].trim();
    else if (jobQuickMatch) jobTitle = jobQuickMatch[1].trim();

    let baseRate = 0;
    if (rateMatch) baseRate = parseFloat(rateMatch[1] || rateMatch[2] || '0');

    return {
      name,
      jobTitle: jobTitle || 'عامل',
      baseRate,
      salaryType: isMonthly ? 'MONTHLY' : 'DAILY',
      autoAttendance: true,
      phone,
    };
  }

  private extractAliasesFromClause(clause: string, canonicalName: string): string[] {
    const aliases: string[] = [];
    const aliasParen = clause.match(/([\u0600-\u06FF\sA-Za-z]{3,40}?)\s*\(\s*(?:اللي\s*هو|يعني|أي)\s*/);
    if (aliasParen) {
      const altName = this.cleanEmployeeName(aliasParen[1]);
      if (altName && altName !== canonicalName) aliases.push(altName);
    }
    const nameParts = canonicalName.split(/\s+/);
    if (nameParts.length > 1) aliases.push(nameParts[0]);
    return aliases;
  }

  private resolveEmployeeName(raw: string, aliasMap: Map<string, string>, addedNames: string[]): string {
    const cleaned = this.cleanEmployeeName(raw);
    if (!cleaned) return '';
    if (addedNames.includes(cleaned)) return cleaned;
    const fromMap = aliasMap.get(cleaned.toLowerCase());
    if (fromMap) return fromMap;
    for (const key of aliasMap.keys()) {
      if (key.includes(cleaned.toLowerCase()) || cleaned.toLowerCase().includes(key)) {
        return aliasMap.get(key)!;
      }
    }
    for (const n of addedNames) {
      const lower = n.toLowerCase();
      if (lower.includes(cleaned.toLowerCase()) || cleaned.toLowerCase().split(/\s+/).some((w) => lower.includes(w))) {
        return n;
      }
    }
    return cleaned;
  }

  private parseInventoryProducts(clause: string): Array<{
    name: string; sku: string; current_stock: number; unit_price: number; cost_price: number;
  }> {
    const results: Array<{ name: string; sku: string; current_stock: number; unit_price: number; cost_price: number }> = [];
    const sectionHeader = /^(?:فيه|عندي|هناك|بالنسبة (للمنتجات|للمخزن)[^:]*|شحنة جديدة[:]*|دخلنا\s*)\s*/i;
    let cleanClause = clause.replace(sectionHeader, '').trim();

    const clauseLevelSkuMatch = cleanClause.match(/(?:كود|SKU|الكود)\s*(?:بتاعه|بتاع|:|هو|للمنتج|ده|دي|المتعلق)?\s*([A-Za-z0-9_\-]+)/i);
    const clauseLevelSku = clauseLevelSkuMatch ? clauseLevelSkuMatch[1].toUpperCase() : '';

    let parenSafe = cleanClause;
    const parenPlaceholders: Record<string, string> = {};
    let pCounter = 0;
    const parenRe = /\([^()]*\)/g;
    let parenMatch;
    while ((parenMatch = parenRe.exec(cleanClause)) !== null) {
      const key = `\u0001P${pCounter++}\u0001`;
      parenPlaceholders[key] = parenMatch[0];
      parenSafe = parenSafe.replace(parenMatch[0], key);
    }

    const productSplit = parenSafe.split(/[،,]\s*(?=\d+\s+(?:كراتين|كرتون|كرات|طقم|أطقم|قطعة|كيلو|متر|صندوق|شانيور)|\b(?:وكمان|و\s*دخلنا|و\s*ايضاً)\s+)/i).filter((p) => p.trim().length > 3);
    const restoredSplit = productSplit.map((p) => {
      let s = p;
      for (const [k, v] of Object.entries(parenPlaceholders)) s = s.replace(k, v);
      return s;
    });
    if (restoredSplit.length === 0) restoredSplit.push(cleanClause);

    for (let rawPart of restoredSplit) {
      let part = rawPart.trim().replace(/^[،,\sو]+/, '');
      if (part.length < 3) continue;

      const cartonsMatch = part.match(/(\d+(?:\.\d+)?)\s*(?:كراتين|كرتون|كرات|صناديق|صندوق)/i);
      const cartonQty = cartonsMatch ? parseFloat(cartonsMatch[1]) : 0;
      const perCartonMatch = part.match(/(?:(?:الكرتونة|الكرتون|الصندوق)\s+(?:فيها|فيه|تحتوي)\s+(\d+(?:\.\d+)?)\s*(?:قطعة|قطع))/i);
      const perCarton = perCartonMatch ? parseFloat(perCartonMatch[1]) : 0;

      const qtyUnitMatch = part.match(/(\d+(?:\.\d+)?)\s*(?:كراتين|كرتون|كرات|طقم|أطقم|قطعة|كيلو|متر|صندوق|شانيور|طقم|عدد|واحد|واحدة|اثنين|اثنان)/i);
      let quantity = qtyUnitMatch ? parseFloat(qtyUnitMatch[1]) : 0;
      if (cartonQty > 0 && perCarton > 0) {
        quantity = cartonQty * perCarton;
      } else if (cartonQty > 0) {
        quantity = cartonQty;
      }
      if (quantity <= 0) quantity = 1;

      const wholeSalePriceMatch = part.match(/(?:سعر\s*شراء\s*(?:الكرتونة|الكرتون|بالجملة|للكرتونة)|تكلفة\s*(?:الكرتونة|الكرتون)|سعر\s*تكلفة)\s*(?:للقطعة|للواحد)?\s*(\d+(?:\.\d+)?)/i);
      const pieceBuyMatch = part.match(/(?:سعر\s*شراء|سعر\s*التكلفة|تكلفة|بسعر\s*شراء|سعر\s*جملة|سعر شراء)\s+(?:القطعة|الواحد|للواحد)?\s*(\d+(?:\.\d+)?)/i);
      const retailPriceMatch = part.match(/(?:سعر\s*بيع\s*(?:القطعة\s*القطاعي|القطاعي|للواحد|القطعة)|سعر\s*مبيع|بسعر\s*بيع|بيع\s+)(?:للواحد|الواحد)?\s*(\d+(?:\.\d+)?)/i);
      const genericBuy = part.match(/بسعر(?:\s*شراء)?\s+(\d+(?:\.\d+)?)/i);
      const genericSell = part.match(/(?:بيع|مبيع)\s+(?:للواحد\s+)?(\d+(?:\.\d+)?)/i);

      let costPrice = 0;
      let unitPrice = 0;
      if (wholeSalePriceMatch) {
        const wholesaleCarton = parseFloat(wholeSalePriceMatch[1]);
        costPrice = perCarton > 0 ? Math.round(wholesaleCarton / perCarton) : wholesaleCarton;
      } else if (pieceBuyMatch) {
        costPrice = parseFloat(pieceBuyMatch[1]);
      } else if (genericBuy) {
        costPrice = parseFloat(genericBuy[1]);
      }
      if (retailPriceMatch) unitPrice = parseFloat(retailPriceMatch[1]);
      else if (genericSell) unitPrice = parseFloat(genericSell[1]);
      if (!unitPrice && costPrice > 0) unitPrice = Math.round(costPrice * 1.25);
      if (!costPrice && unitPrice > 0) costPrice = Math.round(unitPrice * 0.75);

      if (costPrice === 0 && unitPrice === 0 && !/محول|شانيور|كابل|مفك|صندوق|كرتون|طقم|قطعة|متر|كيلو|بضاعة|منتج|شحنة/.test(part)) {
        continue;
      }

      const skuMatch = part.match(/(?:كود|SKU|الكود)\s*(?:بتاعه|بتاع|:|هو|للمنتج|ده|دي|المتعلق)?\s*([A-Za-z0-9_\-]+)/i);
      const fallbackSku = clauseLevelSku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`;
      const sku = skuMatch ? skuMatch[1].toUpperCase() : fallbackSku;

      let productName = part;
      productName = productName
        .replace(/^\s*(?:شحنة\s*جديدة|دخلنا\s*شحنة|دخلنا|إضافة\s*للمخزون|إضافة\s*للمخزن|منتج\s*مخزون\s*جديد|بضاعة\s*جديدة|منتجات\s*جديدة)\s*[:：،,\s]*\s*(?:من\s*)?/iu, '')
        .replace(/\(\s*(?:[^)]*\b(?:فيها|فيه|تحتوي|سعر|جنيه|كود|SKU)\b[^)]*)\s*\)/gi, '')
        .replace(/(\d+(?:\.\d+)?)\s*(?:كراتين|كرتون|كرات|طقم|أطقم|قطعة|كيلو|متر|صندوق|شانيور|عدد|واحد|واحدة|اثنين|اثنان|جم|طن|لتر)\s*/gi, '')
        .replace(/(?:الكرتونة|الكرتون|الصندوق)\s+(?:فيها|فيه|تحتوي)\s+\d+(?:\.\d+)?\s*(?:قطعة|قطع)/gi, '')
        .replace(/(?:سعر\s*(?:شراء|بيع|شراء\s+الكرتونة|شراء\s+القطعة|بيع\s+القطعة\s+القطاعي|بيع\s+القطاعي|شراء\s+بالجملة|تكلفة|مبيع)(?:\s*(?:الكرتونة|الكرتون|للكرتونة|القطعة|للواحد|الواحد|بالجملة))?\s*)\s*\d+(?:\.\d+)?\s*(?:جنيه|ج\.م|ج)?/gi, '')
        .replace(/(?:تكلفة|بسعر(?:\s*شراء)?|سعر\s*تكلفة)\s*\d+(?:\.\d+)?\s*(?:جنيه|ج\.م|ج)?/gi, '')
        .replace(/(?:بيع|مبيع)(?:\s+للواحد)?\s+\d+(?:\.\d+)?\s*(?:جنيه|ج\.م|ج)?/gi, '')
        .replace(/(?:كود|SKU|الكود)\s*(?:بتاعه|بتاع|:|هو|للمنتج|ده|دي|المتعلق)\s*[A-Za-z0-9_\-]+/gi, '')
        .replace(/(?:اعطِ|اعطي)\s+(?:المنتج\s+)?(?:ده|دي|هذا|هذه)?\s*(?:كود|SKU)?/gi, '')
        .replace(/01[0125]\d{8}/g, '')
        .replace(/\d+(?:\.\d+)?\s*(?:جنيه|ج\.م|ج)/g, '')
        .replace(/[(),،,:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      productName = productName.replace(/^[\sو]+|[\sو]+$/g, '').trim();
      productName = productName.replace(/^\s*(?:شحنة\s*جديدة|دخلنا|منتج\s*مخزون|المنتج\s*ده|منتج\s*جديد)\s*/iu, '').trim();
      if (!productName) productName = 'منتج مخزون جديد';
      if (productName.length < 2) productName = 'منتج مخزون جديد';

      results.push({ name: productName, sku, current_stock: quantity, unit_price: unitPrice, cost_price: costPrice });
    }
    if (results.length > 1) {
      for (let i = 0; i < results.length; i++) {
        for (let j = i + 1; j < results.length; j++) {
          const a = results[i];
          const b = results[j];
          const aKey = a.name.split(/\s+/).filter((w) => w.length > 2);
          const bKey = b.name.split(/\s+/).filter((w) => w.length > 2);
          const overlap = aKey.filter((x) => bKey.some((y) => y.includes(x) || x.includes(y)));
          const sameWords = overlap.length >= 1;
          const oneHasQty = (a.current_stock > 1 && b.current_stock === 1) || (b.current_stock > 1 && a.current_stock === 1);
          const priceMerge = (a.cost_price === 0 && a.unit_price === 0 && b.cost_price > 0) || (b.cost_price === 0 && b.unit_price === 0 && a.cost_price > 0);
          const zeroPriceOneHasPrice = (a.cost_price === 0 || b.cost_price === 0) && (a.cost_price + b.cost_price > 0) && results.length === 2;
          if (sameWords && (oneHasQty || priceMerge || zeroPriceOneHasPrice) || zeroPriceOneHasPrice) {
            const keeper = a.current_stock > b.current_stock ? a : (a.cost_price === 0 ? b : a);
            const donor = keeper === a ? b : a;
            if (keeper.cost_price === 0 && keeper.unit_price === 0) {
              keeper.cost_price = donor.cost_price;
              keeper.unit_price = donor.unit_price;
            }
            if (keeper.current_stock === 1 && donor.current_stock > 1) {
              keeper.current_stock = donor.current_stock;
            }
            if (clauseLevelSku && !keeper.sku.startsWith(clauseLevelSku.substring(0, 3))) {
              keeper.sku = clauseLevelSku;
            } else if (keeper.sku.startsWith('SKU-') && !donor.sku.startsWith('SKU-')) {
              keeper.sku = donor.sku;
            }
            results.splice(j, 1);
            j--;
          }
        }
      }
      if (clauseLevelSku && results.length === 1 && results[0].sku.startsWith('SKU-')) {
        results[0].sku = clauseLevelSku;
      }
    } else if (clauseLevelSku && results.length === 1 && results[0].sku.startsWith('SKU-')) {
      results[0].sku = clauseLevelSku;
    }
    return results;
  }

  private parseMultipleWithdrawalsFromClause(clause: string): Array<{ productName: string; quantity: number }> {
    const products: Array<{ productName: string; quantity: number }> = [];
    const verbsRe = /(?:أخذ|اخد|أخد|ليه عهدة|عنده عهدة)\s+/u;
    const nounRe = /(?:مسحوبات|عهدة)\s+/u;
    let tail = '';
    const verbMatch = clause.match(verbsRe);
    const nounMatch = clause.match(nounRe);
    let cutIdx = -1;
    if (verbMatch && verbMatch.index !== undefined) {
      cutIdx = verbMatch.index + verbMatch[0].length;
    } else if (nounMatch && nounMatch.index !== undefined && !/المسحوبات\s*و/.test(clause.slice(Math.max(0, nounMatch.index - 10), nounMatch.index + 15))) {
      cutIdx = nounMatch.index + nounMatch[0].length;
    }
    if (cutIdx >= 0) tail = clause.slice(cutIdx).trim();
    tail = tail.replace(/\s*(?:عشان|عشان|لـ|لعمل|لمشروع|للعمل|بس\s+بعد|بعد\s+ساعة|رجّع|رجع|إرجاع|ارجاع|رجعت|مرتجع|وطالع|وطلع|وسجل|وسحب|بدال|بديل|واحد جديد|بداله|يستبدل|استبدال|هالك|تالف|محروق|اتلف|خردة|scrap)\b[\s\S]*$/iu, '').trim();
    tail = tail.replace(/\s*["'\u201C\u201D].*$/, '').trim();
    tail = tail.replace(/\s*(?:المشروع|الفندق|المحل|العميل|اسم)\b[:：]?.*$/iu, '').trim();
    tail = tail.replace(/^\s*(?:الأسطة|عاطف|حسن|محمود|سيف|أبو|عم|باشا|أستاذ|ده|دي)\s+(?:أخذ|اخد|أخد|ليه|عنده|عهدة|مسحوبات)?\s*/u, '').trim();
    const segMatches = tail.split(/[،,]\s*و\s+|\s+و\s+(?=\d+)/).map((s) => s.trim()).filter(Boolean);
    for (const seg of segMatches) {
      if (!/[\u0600-\u06FF]/.test(seg) && !/[a-zA-Z]/.test(seg)) continue;
      const qtyMatch = seg.match(/(\d+(?:\.\d+)?)\s*(?:كرتون|قطعة|طقم|متر|كيلو|صندوق|عدد|واحد|واحدة|محول|محولات|شانيور|كابل|مفكات)?/i);
      const qty = qtyMatch ? parseFloat(qtyMatch[1]) : 1;
      let productName = seg
        .replace(/(\d+(?:\.\d+)?)\s*(?:كرتون|قطعة|طقم|متر|كيلو|صندوق|عدد|واحد|واحدة)/gi, '')
        .replace(/^\s*(?:بدال|بديل|واحد)[\sو،,]*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      productName = productName.replace(/^[،,\sو]+|[،,\sو]+$/g, '');
      if (!productName) productName = 'منتج مسحوب';
      if (/^(?:المشروع|الفندق|اسم|عاطف|حسن|محمود|سيف|أبو|الأسطة|والمسحوبات|المسحوبات|والهالك|الهالك)$/iu.test(productName)) continue;
      if (productName.length < 2) continue;
      const exist = products.find((p) => p.productName.toLowerCase() === productName.toLowerCase());
      if (exist) exist.quantity += qty;
      else products.push({ productName, quantity: qty });
    }
    if (products.length === 0 && tail.length > 1 && /[\u0600-\u06FFa-zA-Z]/.test(tail.replace(/[\u064b-\u0652]/g,''))) {
      const cleanTail = tail
        .replace(/^\s*(?:المسحوبات|والهالك|الهالك|والعهدة|العهدة)\b[:：]?\s*/iu, '')
        .replace(/\s*(?:المشروع|الفندق|اسم)\b[:：]?.*$/iu, '')
        .replace(/^\s*(?:الأسطة|عاطف|حسن|محمود|سيف|أبو|عامل|فني)\s+\w*\s*/u, '')
        .trim();
      if (cleanTail && cleanTail.length > 2 && !/^(?:المشروع|الفندق|اسم|عاطف|حسن|محمود|سيف|أبو|الأسطة)$/iu.test(cleanTail)) {
        products.push({ productName: cleanTail, quantity: 1 });
      }
    }
    return products;
  }

  private heuristicChatFallback(messageText: string): ProcessChatResult {
    const today = new Date().toISOString().slice(0, 10);
    const clauses = this.splitIntoClauses(messageText);
    const rawActions: Array<{ intent: string; extractedData: Record<string, unknown>; description: string }> = [];

    const aliasMap = new Map<string, string>();
    const addedEmployeeCanonical: string[] = [];
    const lastNames: string[] = [];
    const globalPhones: string[] = [];
    const phoneRe = /(?<!\d)(?:01[0125]\d{8}|02\d{8,9}|\+201[0125]\d{8})(?!\d)/g;
    let pm;
    while ((pm = phoneRe.exec(messageText)) !== null) globalPhones.push(pm[0]);

    const pushAction = (action: { intent: string; extractedData: Record<string, unknown>; description: string }) => {
      rawActions.push(action);
    };

    const registerEmployee = (canonicalName: string, aliases: string[]) => {
      if (!addedEmployeeCanonical.includes(canonicalName)) addedEmployeeCanonical.push(canonicalName);
      for (const a of aliases) {
        aliasMap.set(a.toLowerCase(), canonicalName);
      }
      aliasMap.set(canonicalName.toLowerCase(), canonicalName);
      lastNames.unshift(canonicalName);
      while (lastNames.length > 5) lastNames.pop();
    };

    const resolveName = (raw: string): string => this.resolveEmployeeName(raw, aliasMap, addedEmployeeCanonical) || lastNames[0] || '';

    let lastSettlementParty: string = '';

    for (let idx = 0; idx < clauses.length; idx++) {
      const clause = clauses[idx];

      const clausePhone = this.extractPhone(clause);
      const phone = clausePhone || (globalPhones.length === 1 ? globalPhones[0] : '');

      // ===== ADD_EMPLOYEE =====
      const looksAddEmployee =
        clause.includes('موظف جديد') || clause.includes('عامل جديد') || clause.includes('فني جديد') ||
        clause.includes('موظف تاني') || clause.includes('عامل تاني') ||
        clause.includes('أضف موظف') || clause.includes('اضف موظف') || clause.includes('أضف عامل') || clause.includes('اضف عامل') ||
        (clause.match(/(?:اسمه|باسم)\s*[(\u0028]/) && (clause.includes('وظيفته') || clause.includes('بوظيفة') || clause.includes('وظيفة') || clause.includes('مساعد') || clause.includes('عامل') || clause.includes('فني')));
      if (looksAddEmployee) {
        const info = this.extractEmployeeFromClause(clause);
        if (info) {
          const aliases = this.extractAliasesFromClause(clause, info.name);
          registerEmployee(info.name, aliases);
          const ed: Record<string, unknown> = {
            employeeName: info.name,
            jobTitle: info.jobTitle,
            baseRate: info.baseRate,
            salaryType: info.salaryType,
            autoAttendance: info.autoAttendance,
          };
          if (info.phone || phone) ed.phone = info.phone || phone;
          pushAction({
            intent: 'ADD_EMPLOYEE',
            extractedData: ed,
            description: `إضافة موظف "${info.name}" — ${info.jobTitle}${info.baseRate ? `، راتب ${info.salaryType === 'MONTHLY' ? 'شهري' : 'يومي'} ${info.baseRate}` : ''}${ed.phone ? `، تليفون: ${ed.phone}` : ''}`,
          });
          continue;
        }
      }

      // ===== RETURN_TO_INVENTORY + SCRAP detection (process first, but DON'T skip original withdrawal) =====
      const hasReturn = /رجّع|ارجع|إرجاع|ارجاع|رجعت|مرتجع|رجع/.test(clause);
      const hasScrap = /هالك|تالف|صفراء|خردة|scrap|محرق|محروق|معطل|اتلف/i.test(clause);
      const hasExchange = /بدال|بديل|واحد جديد|بداله|يستبدل|استبدال/.test(clause);
      if (hasReturn) {
        const verbIdx = clause.search(/رجّع|ارجع|إرجاع|ارجاع|رجعت|مرتجع|رجع/);
        const afterVerb = clause.slice(verbIdx);
        const qtyMatch = afterVerb.match(/(\d+(?:\.\d+)?)\s*(?:كيلو|متر|قطعة|جم|طن|لتر|منهم|منو|منها|واحد|واحدة|كرتون|طقم|محول|محولات|شانيور)?/);
        const qty = qtyMatch ? parseFloat(qtyMatch[1]) : 1;
        const beforeVerb = clause.slice(0, Math.max(0, verbIdx));
        const empMatch = beforeVerb.match(/([\u0600-\u06FFa-zA-Z\s]{3,40}?)(?:\s*،\s*|\s+بس\s+|\s+بعد|$)/);
        const productArea = afterVerb.replace(/.*?(?:رجّع|ارجع|إرجاع|ارجاع|رجعت|مرتجع|رجع)\s*/, '');
        let productName = productArea
          .replace(/(?:للمخزن|للمخزون|المخزن|المخزون)/gi, '')
          .replace(/(?:عشان|لأن|لكن|بعد|وبعد|وطالع|وطلع|وسجل|وسحب)\s+.*$/s, '')
          .replace(/\b(?:منهم|منو|منها|من|فيهم|فيها)\b/gi, ' ')
          .replace(/\d+(?:\.\d+)?/g, '')
          .replace(/[،,:]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        productName = productName.replace(/^[\sو]+|[\sو]+$/g, '').trim();
        productName = productName || 'منتج مرتجع';
        pushAction({
          intent: 'RETURN_TO_INVENTORY',
          extractedData: { name: productName, current_stock: qty, items: [{ productNameOrSku: productName, quantity: qty }] },
          description: `إرجاع ${qty} من "${productName}" للمخزن${empMatch ? ` من ${resolveName(empMatch[1]) || 'موظف'}` : ''}`,
        });
        if (hasScrap) {
          pushAction({
            intent: 'EXPENSE',
            extractedData: { amount: 0, expenseCategory: 'أخرى', notes: 'هالك / تالف / scrap' },
            description: `تسجيل هالك / تالف "${productName}" في قائمة الخردة`,
          });
        }
        if (hasExchange) {
          const fromEmployee = empMatch ? resolveName(empMatch[1]) || '' : lastNames[0] || '';
          if (fromEmployee) {
            pushAction({
              intent: 'INVENTORY_WITHDRAWAL',
              extractedData: { employeeName: fromEmployee, productName, quantity: qty },
              description: `بديل: عهدة "${productName}" (${qty}) لـ "${fromEmployee}" (بديل عن التالف)`,
            });
          }
        }
      }

      // ===== INVENTORY_WITHDRAWAL =====
      const withdrawalVerbsRe = /(?:[اأإ]خ[ذد]|[اإ]?خذ|ليه?\s+عهدة|عنده\s+عهدة|عهدة|مسحوبات|عهد|بسحب|يسحب|سحب)[^ء-يA-Za-z]/u;
      const hasWithdrawal =
        withdrawalVerbsRe.test(' ' + clause + ' ') &&
        !clause.includes('سلفة') &&
        !/(?:خصم|يخصم|واخصم)\s+(?:من|له|عليه)/.test(clause.replace(/غاب\s*بدون\s*إذن\s*واخصم\s*منه\s*يوم/, '')) &&
        !clause.includes('من الخزنة') &&
        !clause.includes('مصروف') &&
        !clause.includes('فاتورة') &&
        !/أفرتايم|ساعات\s+(?:عمل|مضى|اضافي|إضافي)|ساعة\s*\d/.test(clause);
      if (hasWithdrawal) {
        let clauseForWithdrawal = clause;
        if (hasReturn) {
          const retIdx = clause.search(/رجّع|ارجع|إرجاع|ارجاع|رجعت|مرتجع|رجع|بس\s+بعد|بعد\s+ساعة/);
          if (retIdx > 0) clauseForWithdrawal = clause.slice(0, retIdx);
        }
        const whoMatch = clauseForWithdrawal.match(/(?:^|[\s،,])([\u0600-\u06FFa-zA-Z\s]{3,40}?)\s+(?:[اأإ]خ[ذد]|[اإ]?خذ|ليه?\s+عهدة|عنده\s+عهدة|عهدة|مسحوبات|سحب)\s+/u);
        let employeeName = whoMatch ? resolveName(whoMatch[1]) : '';
        if (!employeeName) employeeName = lastNames[0] || '';
        if (employeeName) {
          registerEmployee(employeeName, [employeeName.split(/\s+/)[0]]);
          const items = this.parseMultipleWithdrawalsFromClause(clauseForWithdrawal);
          for (const it of items) {
            pushAction({
              intent: 'INVENTORY_WITHDRAWAL',
              extractedData: { employeeName, productName: it.productName, quantity: it.quantity },
              description: `عهدة "${it.productName}" (${it.quantity}) لـ "${employeeName}"`,
            });
          }
          continue;
        }
      }

      // ===== ADD_INVENTORY =====
      const inventoryContaminationRe = /(?:[اأإ]خ[ذد]|[اإ]?خذ|رجّع|ارجع|إرجاع|مرتجع|بدال|بديل|عهدة|مسحوبة|سحب|هالك|تالف|خردة|scrap|محروق)[^ء-يA-Za-z]/u;
      const looksAddInventory =
        !inventoryContaminationRe.test(' ' + clause + ' ') &&
        !(/(?:الأسطة|أستاذ|باشا|عم|موظف|عامل|فني)\s+[\u0600-\u06FFa-zA-Z\s]{1,30}?(?:أخذ|اخد|أخد|عهدة)/u.test(clause)) &&
        (
          clause.includes('للمخزون') || clause.includes('للمخزن') || clause.includes('ضف للمخزون') || clause.includes('أضف للمخزون') || clause.includes('إضافة للمخزون') ||
          clause.includes('منتج جديد') || clause.includes('بضاعة جديدة') || clause.includes('منتجات جديدة دخلت المخزن') || clause.includes('شحنة جديدة') || (clause.includes('دخلنا') && /(?:محول|شانيور|مفكات|كابل|كرتون|كراتين|طقم|قطعة|أطقم)/u.test(clause)) ||
          clause.includes('الكود بتاعه') ||
          (/سعر/.test(clause) && /(?:طقم|كابل|كيلو|قطعة|متر|صندوق|جم|طن|لتر|كرتون|كراتين|شانيور|محولات|أطقم)/u.test(clause))
        );
      if (looksAddInventory) {
        const products = this.parseInventoryProducts(clause);
        let addedAny = false;
        for (const p of products) {
          if (phone && !p.name.includes('تليفون')) { /* ignore phone noise already */ }
          if (p.name.length < 2 || /^(?:رقم|تليفون|تليفونه)/i.test(p.name)) continue;
          pushAction({
            intent: 'ADD_INVENTORY',
            extractedData: p,
            description: `إضافة "${p.name}" (كمية: ${p.current_stock}) تكلفة ${p.cost_price} ج.م + سعر بيع ${p.unit_price} ج.م, SKU: ${p.sku}`,
          });
          addedAny = true;
        }
        if (addedAny) continue;
      }

      // ===== SERVICE_ORDER: افتح طلب خدمة (طلب صيانة / فنيين) =====
      const looksServiceOrder =
        /(?:افتح|أنشئ|أضف|سجل)\s*(?:طلب\s*خدمة|أوردر\s*خدمة|طلب\s*صيانة|مهمة)/i.test(clause)
        || /(?:عيّن|عين|خصص)\s*(?:له|لها|للطلب|للمهمة)\s*.*(?:فني|مساعد|رئيسي|فريق)/i.test(clause);
      if (looksServiceOrder) {
        const titleMatch = clause.match(/(?:ب['"']|باسم|اسم)\s*['"\u201C\u201D]?\s*([\u0600-\u06FFa-zA-Z0-9\s]{3,60}?)\s*['"\u201C\u201D]?\s*(?:[،,]|\s+التصنيف|\s+الأولوية|\s+عيّن|$)/);
        const categoryMatch = clause.match(/(?:التصنيف|النوع|الفئة)\s*[:：]?\s*([\u0600-\u06FFa-zA-Z\s]{2,40}?)(?:\s+[،,]\s*|\s+الأولوية|\s+عيّن|$)/);
        const priorityMatch = clause.match(/(?:الأولوية|الاهمية|التستعجال)\s*[:：]?\s*(عاجل|عادي|منخفض|متوسط|مرتفع|طالع|حرج)/i);
        const leadMatch = clause.match(/عيّن\s*له\s*([\u0600-\u06FFa-zA-Z\s]{3,40}?)\s*(?:كفني\s*رئيسي|كـ?فني\s*رئيسي|كمشرف|رئيسي|مسؤول)/);
        const assistantMatch = clause.match(/(?:كفني\s*رئيسي|فني\s*رئيسي|رئيسي|مشرف|مسؤول)\s*(?:و|،|,|:|\s+)\s*([\u0600-\u06FFa-zA-Z][\u0600-\u06FFa-zA-Z0-9\s]{0,35}?)\s*(?:مساعد|مساعد فني|ثاني)/);
        const title = titleMatch ? titleMatch[1].trim() : 'طلب خدمة جديد';
        const category = categoryMatch ? categoryMatch[1].trim() : 'عام';
        const priority = priorityMatch ? priorityMatch[1] : 'عادي';
        const lead = leadMatch ? resolveName(leadMatch[1]) : '';
        const assistant = assistantMatch ? resolveName(assistantMatch[1]) : '';
        pushAction({
          intent: 'SERVICE_ORDER',
          extractedData: {
            title,
            category,
            priority,
            leadTechnician: lead,
            assistantTechnician: assistant,
            status: 'OPEN',
          },
          description: `طلب خدمة جديد: "${title}" [${category}] أولوية ${priority}${lead ? `، فني رئيسي: ${lead}` : ''}${assistant ? `، مساعد: ${assistant}` : ''}`,
        });
        const serviceOrderEndMatch = clause.match(/(?:عاطف|سيف|مساعد|فني\s+رئيسي|رئيسي|مشرف)[^،,.\s]*\s*(?:\.|\s+)([\s\S]*)$/);
        let expenseRemainder = clause;
        if (serviceOrderEndMatch && serviceOrderEndMatch[1] && serviceOrderEndMatch[1].length > 10) {
          expenseRemainder = serviceOrderEndMatch[1].trim();
        } else {
          const svcRe = /(?:عيّن|عين|خصص)\s*(?:له|لها|للطلب|للمهمة)\s*.*?(?:فني|مساعد|رئيسي|فريق)[\u0600-\u06FFa-zA-Z0-9\s]{3,40}?([\s\S]*)$/;
          const m2 = clause.match(svcRe);
          if (m2 && m2[1] && m2[1].length > 10) expenseRemainder = m2[1].trim();
        }
        const mealMatch = expenseRemainder.match(/(?:غداء|عشاء|فطور|سحور|افطار|وجبة|مطعم)[^0-9]*(\d+(?:\.\d+)?)\s*(?:جنيه|ج\.م|ج|دولار|ليرة)?/i);
        if (mealMatch) {
          const amt = parseFloat(mealMatch[1]);
          if (amt > 0) {
            pushAction({
              intent: 'EXPENSE',
              extractedData: { amount: amt, expenseCategory: 'أخرى', notes: 'غداء / وجبة عمال في الموقع' },
              description: `تسجيل مصروف "غداء عمال" بمبلغ ${amt} ج.م`,
            });
          }
        } else if (/صرفنا\s+من\s+(?:الخزنة|الصندوق)/.test(expenseRemainder)) {
          const m = expenseRemainder.match(/صرفنا\s+من\s+(?:الخزنة|الصندوق)\s+(\d+(?:\.\d+)?)/);
          const amt = m ? parseFloat(m[1]) : (this.parseMoneyAmount(expenseRemainder).amount);
          if (amt > 0) {
            pushAction({
              intent: 'EXPENSE',
              extractedData: { amount: amt, expenseCategory: 'أخرى', notes: 'مصروف من الخزنة (غداء عمال)' },
              description: `تسجيل مصروف "غداء عمال" بمبلغ ${amt} ج.م`,
            });
          }
        }
        const fuelMatch = expenseRemainder.match(/(?:بنزين|وقود|ديزل|شحن\s*كارت|كارت\s*بنزين|شحن\s*بنزين)[^0-9]*(\d+(?:\.\d+)?)\s*(?:جنيه|ج\.م|ج|دولار|ليرة)?/i);
        if (fuelMatch) {
          const amt = parseFloat(fuelMatch[1]);
          if (amt > 0 && amt !== (mealMatch ? parseFloat(mealMatch[1]) : 0)) {
            pushAction({
              intent: 'EXPENSE',
              extractedData: { amount: amt, expenseCategory: 'نقل', notes: 'شحن بنزين / وقود لعربية الشغل' },
              description: `تسجيل مصروف "بنزين" بمبلغ ${amt} ج.م`,
            });
          }
        } else if (/(?:شحنا|شحن|اشترينا|اشتري)\s*.*?(?:بنزين|وقود|عربية|ديزل)/.test(expenseRemainder)) {
          const amt = this.parseMoneyAmount(expenseRemainder).amount;
          const mealAmt = mealMatch ? parseFloat(mealMatch[1]) : 0;
          const fuelAmt = amt > mealAmt ? amt : 0;
          if (fuelAmt > 0 && fuelAmt !== mealAmt) {
            pushAction({
              intent: 'EXPENSE',
              extractedData: { amount: fuelAmt, expenseCategory: 'نقل', notes: 'شحن بنزين / وقود لعربية الشغل' },
              description: `تسجيل مصروف "بنزين" بمبلغ ${fuelAmt} ج.م`,
            });
          }
        }
        continue;
      }

      // ===== EMPLOYEE_ATTENDANCE (+ optional DEDUCTION for absent-without-permission) =====
      const looksAttendance =
        clause.includes('حضور') || clause.includes('سجل حضور') || clause.includes('حضر') ||
        clause.includes('غياب') || clause.includes('غاب') || clause.includes('متأخر') ||
        clause.includes('استأذن') || clause.includes('إذن') || /ساعة\s*\d/.test(clause);
      if (looksAttendance) {
        const subBlocks = clause.split(/[،,]\s*/).filter((b) =>
          /حضر|غاب|غياب|غائب|متأخر|استأذن|إذن|حضور/.test(b),
        );
        const stopWordsRe = /(?:بس|فقط|فقط|خلاص|حسبي|دا|ده|دي|هذا|هذه|ذلك|تلك|اللي|هو|هي|انت|انا)\s*$/;
        for (const block of (subBlocks.length > 0 ? subBlocks : [clause])) {
          const aliasCanonical = block.match(/\(\s*(?:اللي\s*هو|يعني|أي)\s*([\u0600-\u06FF\sA-Za-z]{3,50}?)\s*\)/);
          let cleanBlock = block;
          let canonicalHint = '';
          if (aliasCanonical) {
            canonicalHint = aliasCanonical[1].trim();
            cleanBlock = cleanBlock.replace(/\(\s*(?:اللي\s*هو|يعني|أي)\s*[\u0600-\u06FF\sA-Za-z]{3,50}?\s*\)/, '');
          }
          const attMatch = cleanBlock.match(/([\u0600-\u06FFa-zA-Z\s]{3,40}?)\s+(حضر|غاب|غياب|غائب|متأخر|حضور|استأذن|إذن)/);
          if (!attMatch) continue;
          let rawName = attMatch[1].trim();
          rawName = rawName.replace(stopWordsRe, '').trim();
          rawName = rawName.replace(/^[\sو،,]+|[\sو،,]+$/g, '').trim();
          const empName = canonicalHint || resolveName(rawName) || resolveName(rawName.replace(stopWordsRe, ''));
          if (empName) registerEmployee(empName, [empName.split(/\s+/)[0]]);
          const verb = attMatch[2];
          const isAbsent = /غاب|غياب|غائب/.test(verb);
          const isLate = /متأخر|تأخير|استأذن|إذن|HALF_DAY|نص\s+ساعة/.test(block);
          const status = isAbsent ? 'ABSENT' : isLate ? 'HALF_DAY' : 'PRESENT';
          if (empName) {
            pushAction({
              intent: 'EMPLOYEE_ATTENDANCE',
              extractedData: { employeeName: empName, attendanceStatus: status, date: today },
              description: `تسجيل ${isAbsent ? 'غياب' : isLate ? 'حضور (استأذن/متأخر)' : 'حضور'} الموظف "${empName}"`,
            });
          }
          if (/غاب.*(?:بدون\s+إذن|بدون إذن)/.test(block) && empName) {
            pushAction({
              intent: 'EMPLOYEE_ADVANCE',
              extractedData: { employeeName: empName, transactionType: 'DEDUCTION', amount: 1, notes: 'خصم يوم غياب بدون إذن' },
              description: `خصم يوم غياب بدون إذن للموظف "${empName}"`,
            });
          }
        }
      }

      // ===== SETTLEMENT: تسوية / مديونية / سداد / دفعة / استلم / تحت الحساب / حولنا للمورد / خصم للعميل / باقي مؤجل =====
      const containsAnyMoney = /\b\d{3,8}\b/.test(clause) && !this.isPhone(clause);
      const looksSettlement = (
        clause.includes('مديونية') || clause.includes('تسوية') || clause.includes('سداد') ||
        clause.includes('دفعة') || clause.includes('عليه') || clause.includes('مدين') ||
        clause.includes('استلم') || clause.includes('قبض') || clause.includes('تحت الحساب') ||
        clause.includes('تستحق') ||
        (clause.includes('خصم') && (clause.includes('للعميل') || clause.includes('له') || clause.includes('بسبب') || clause.includes('اتأخر'))) ||
        /(?:باقي|تستحق)\s*(?:فاتورة|حساب|المبلغ|متبقي)?[\s\dج\.]*?(?:مؤجل|على\s+الحساب|لاحقاً|يتبقى)/.test(clause) ||
        /(?:مؤجل|تستحق|على\s+الحساب)\s*.*\b\d{3,8}\b/.test(clause) ||
        ((clause.includes('حولنا') || clause.includes('تحويل')) && (clause.includes('لمورد') || clause.includes('لعميل') || clause.includes('لـ') || /شركة|أستاذ|فندق|فودافون\s*كاش/.test(clause)))
      ) && containsAnyMoney;
      if (looksSettlement) {
        const scannedAmounts = new Set<number>();
        const fuelExpenseMatch = clause.match(/(?:بنزين|وقود|ديزل|شحن\s*كارت|كارت\s*بنزين)[^0-9]*(\d+(?:\.\d+)?)\s*(?:جنيه|ج\.م|ج)/i);
        if (fuelExpenseMatch) {
          const amt = parseFloat(fuelExpenseMatch[1]);
          if (amt > 0 && amt < 1000) {
            pushAction({
              intent: 'EXPENSE',
              extractedData: { amount: amt, expenseCategory: 'نقل', notes: 'شحن بنزين لعربية الشغل' },
              description: `تسجيل مصروف "بنزين" بمبلغ ${amt} ج.م`,
            });
            scannedAmounts.add(amt);
          }
        }
        const mealExpenseMatch = clause.match(/(?:غداء|عشاء|فطور|سحور|افطار|وجبة)[^0-9]*(\d+(?:\.\d+)?)\s*(?:جنيه|ج\.م|ج)/i);
        if (mealExpenseMatch) {
          const amt = parseFloat(mealExpenseMatch[1]);
          if (amt > 0 && !scannedAmounts.has(amt)) {
            pushAction({
              intent: 'EXPENSE',
              extractedData: { amount: amt, expenseCategory: 'أخرى', notes: 'غداء عمال في الموقع' },
              description: `تسجيل مصروف "غداء عمال" بمبلغ ${amt} ج.م`,
            });
            scannedAmounts.add(amt);
          }
        }

        const allAmounts: Array<{ amount: number; pos: number; context: string }> = [];
        const amountRe = /(\d+(?:\.\d+)?)(?:\s*(?:جنيه|ج\.م|ج|دولار|ليرة))?/g;
        let mAmount: RegExpExecArray | null;
        while ((mAmount = amountRe.exec(clause)) !== null) {
          const num = mAmount[1];
          if (this.isPhone(num)) continue;
          const amt = parseFloat(num);
          if (amt <= 0 || amt >= 1e9 || scannedAmounts.has(amt)) continue;
          const pos = mAmount.index;
          const left = Math.max(0, pos - 50);
          const right = Math.min(clause.length, pos + mAmount[0].length + 50);
          const context = (' ' + clause.slice(left, right).replace(/\d+(?:\.\d+)?/g, ' #AMT# ') + ' ').replace(/\s+/g, ' ');
          allAmounts.push({ amount: amt, pos, context });
        }

        for (const { amount, context } of allAmounts) {
          const isDiscountClause = /(?:خصم|حسم|تخفيض|نقصان|بسبب\s+.*(?:اتأخر|تأخر|محروق|تالف|عطل))/i.test(context);
          const isDeferredClause = /(?:باقي|متبقي|مستحق|تستحق)[^#،,]*?(?:مؤجل|على\s+الحساب|لاحقاً|متبقي|مستحق|تستحق)/.test(context);
          const isSupplierPayment =
            (/حولنا|تحويل|سداد|دفعنا|دفع|فودافون\s*كاش/.test(context) && /(?:لمورد|للمورد|المورد|لـ\s*شركة|لـ\s*[^\s]*(?:شركة|مؤسسة))/.test(context))
            || (/شركة\s*(?:التقنية|الأمل|الخير|النور|الصدر)/.test(context) && /حولنا|سداد|دفع|تحويل|فودافون/.test(context));
          const isCreditPayment = /(?:استلم|استلمنا|قبلنا|قبض|دفعة\s+تحت|تحت\s+الحساب|كاش\s+دفعة|مبلغ\s+.*كاش)/.test(context);
          const isDebit = isDiscountClause || isDeferredClause || isSupplierPayment ||
            /عليه|مديونية|مدين|مديون|مستحق|تستحق|مدين|متبقي(?!.*حساب.*تحت)|للمورد|لمورد/.test(context);
          const entryType: 'CREDIT' | 'DEBIT' = (!isDebit && isCreditPayment) ? 'CREDIT' : isDebit ? 'DEBIT' : (isCreditPayment ? 'CREDIT' : 'CREDIT');

          let partyIdentifier = '';
          const quotedPm = context.match(/['"\u201C\u201D]([\u0600-\u06FFa-zA-Z][^'"\u201C\u201D]{2,50})['"\u201C\u201D]/);
          if (quotedPm) partyIdentifier = quotedPm[1].trim();
          if (!partyIdentifier) {
            const pm = context.match(/(?:من\s+|لـ\s*|للمورد\s+|لمورد\s+|للعميل\s+|للزبون\s+|عميل\s+|على\s+حساب\s+|على\s+|له\s+|لـ)"?\s*'?\s*(?:مدير\s+)?(?:الفندق\s+|المحل\s+|الشركة\s+)?([\u0600-\u06FFa-zA-Z][\u0600-\u06FFa-zA-Z0-9\s\-]{2,45}?)\s*['"]?\s*(?=\s*#AMT#|\bمبلغ|\bجنيه|\bج\.م|\bكاش|\bدفعة|\bتحت\s+الحساب|\bبسبب|$|[،,])/);
            if (pm) {
              let candidate = pm[1].trim();
              const roleOnlyRe = /^(?:مدير|مشرف|كبير|محاسب|سائق|مندوب|موظف)\s*(?:الفندق|المحل|الشركة|المكان|الموقع)?$/;
              if (!roleOnlyRe.test(candidate) && candidate.length > 2) {
                partyIdentifier = candidate;
              }
            }
          }
          if (!partyIdentifier) {
            const loosePm = context.match(/(?:أستاذ|أستاذه|السيد|السيدة|شركة|مؤسسة|فندق|مطعم|محل)\s+[\u0600-\u06FFa-zA-Z0-9\s]{2,35}?(?=\s*#AMT#|\s*\d|\s*جنيه|\s*ج\.م|$|[،,])/);
            if (loosePm) partyIdentifier = loosePm[0].trim();
          }
          if (!partyIdentifier || /^طرف\s*\(/.test(partyIdentifier)) {
            if ((isDiscountClause || isDeferredClause) && lastSettlementParty) {
              partyIdentifier = lastSettlementParty;
            } else if (isCreditPayment && lastSettlementParty && !isSupplierPayment) {
              partyIdentifier = lastSettlementParty;
            }
          }
          if (!partyIdentifier) partyIdentifier = isDebit ? 'طرف (مديونية/خصم)' : 'طرف (سداد)';
          partyIdentifier = partyIdentifier.replace(/^[\sو،,]+|[\sو،,]+$/g, '').trim();
          if (/^(?:مدير|مشرف)\s*(?:الفندق|المحل|الشركة)$/u.test(partyIdentifier)) {
            if (lastSettlementParty) partyIdentifier = lastSettlementParty;
          }

          if (isDiscountClause) {
            pushAction({
              intent: 'SETTLEMENT',
              extractedData: { partyIdentifier, entryType: 'DEBIT', amount, notes: 'خصم / حسم / تخفيض' },
              description: `تسجيل خصم / حسم على حساب "${partyIdentifier}" بمبلغ ${amount} ج.م`,
            });
          } else if (isDeferredClause) {
            pushAction({
              intent: 'SETTLEMENT',
              extractedData: { partyIdentifier, entryType: 'DEBIT', amount, notes: 'باقي فاتورة مؤجل' },
              description: `تسجيل باقي فاتورة مؤجل بمبلغ ${amount} ج.م على حساب "${partyIdentifier}"`,
            });
          } else if (isSupplierPayment) {
            pushAction({
              intent: 'SETTLEMENT',
              extractedData: { partyIdentifier, entryType: 'DEBIT', amount, notes: 'سداد مورد / تحويل' },
              description: `تسجيل سداد مورد / تحويل لـ "${partyIdentifier}" بمبلغ ${amount} ج.م`,
            });
          } else {
            pushAction({
              intent: 'SETTLEMENT',
              extractedData: { partyIdentifier, entryType, amount },
              description: `تسجيل ${entryType === 'DEBIT' ? 'مديونية على' : 'سداد لـ'} "${partyIdentifier}" بمبلغ ${amount} ج.م`,
            });
            if (entryType === 'CREDIT' && !/^طرف\s*\(/.test(partyIdentifier)) {
              lastSettlementParty = partyIdentifier;
            }
          }
        }
        continue;
      }

      // ===== EMPLOYEE_ADVANCE: سلفة / خصم / مكافأة / من الخزنة كاش =====
      const looksAdvance =
        clause.includes('سلفة') || clause.includes('اخصم') || (clause.includes('خصم') && !looksAttendance && !looksSettlement) || clause.includes('مكافأة') ||
        ((clause.includes('من الخزنة') || clause.includes('كاش')) && /(?:أخذ|اخد|أخد|سلف)/.test(clause));
      if (looksAdvance) {
        const nameMatch = clause.match(/(?:^|[\s،,])([\u0600-\u06FFa-zA-Z\s]{3,40}?)\s+(?:أخد|أخذ|اخصم|خصم|سلفة|مكافأة|سلف|خذ)\b/)
          || clause.match(/(?:للموظف|الموظف|على|لـ)\s*["'\u201C]?\s*([\u0600-\u06FFa-zA-Z\s]{3,40}?)\s*["'\u201D]?/);
        let empName = nameMatch ? resolveName(nameMatch[1]) : '';
        if (!empName) empName = lastNames[0] || '';
        const { amount } = this.parseMoneyAmount(clause);
        if (empName && !/الخزنة|المخزن|الفندق/.test(empName) && amount > 0) {
          registerEmployee(empName, [empName.split(/\s+/)[0]]);
          let txType: any = clause.includes('مكافأة') ? 'BONUS' : clause.includes('خصم') ? 'DEDUCTION' : 'ADVANCE';
          pushAction({
            intent: 'EMPLOYEE_ADVANCE',
            extractedData: { employeeName: empName, transactionType: txType, amount },
            description: `${txType === 'BONUS' ? 'مكافأة' : txType === 'DEDUCTION' ? 'خصم' : 'سلفة'} للموظف "${empName}" بمبلغ ${amount} ج.م`,
          });
        }
      }

      // ===== EXPENSE: مصروفات فقط (غداء عمال، شحن بنزين، فواتير، هالك/تالف) =====
      const expenseExcludeRe = /(?:حولنا|تحويل|سداد|دفعة|تحت الحساب|دفع|مديونية|باقي.*مؤجل|خصم.*بسبب|دفعة.*تأخر|فودافون\s*كاش|لمورد|للمورد)/i;
      const looksExpense = !looksSettlement && !expenseExcludeRe.test(clause) && (
        clause.includes('فاتورة') ||
        clause.includes('مصروف') ||
        clause.includes('غداء') || clause.includes('عشاء') || clause.includes('فطور') || clause.includes('سحور') || clause.includes('افطار') ||
        (clause.includes('شحن') && (clause.includes('بنزين') || clause.includes('وقود') || clause.includes('عربية'))) ||
        clause.includes('بنزين') || clause.includes('وقود') ||
        /صرفنا\s+من\s+(?:الخزنة|الصندوق)/.test(clause) ||
        hasScrap
      );
      if (looksExpense) {
        const { amount } = this.parseMoneyAmount(clause);
        let category = 'أخرى';
        if (/كهرباء/.test(clause)) category = 'كهرباء';
        else if (/مياه/.test(clause)) category = 'مياه';
        else if (/موبايل|فودافون|نت|إنترنت|اتصالات|وي/.test(clause) && !/كاش/.test(clause)) category = 'موبايل';
        else if (/إيجار|ايجار/.test(clause)) category = 'إيجار';
        else if (/غداء|عشاء|فطور|سحور|افطار|وجبة|مطعم/.test(clause)) category = 'أخرى';
        else if (/بنزين|وقود|شحن.*عربية|نقل|سفر|diesel|ديزل/.test(clause)) category = 'نقل';
        else if (/مورد/.test(clause)) category = 'موردين';
        if (amount > 0) {
          pushAction({
            intent: 'EXPENSE',
            extractedData: { amount, expenseCategory: category },
            description: `تسجيل مصروف "${/غداء|عشاء|فطور/.test(clause) ? 'غداء عمال' : /بنزين|وقود/.test(clause) ? 'بنزين' : category}" بمبلغ ${amount} ج.م`,
          });
          continue;
        }
      }
    }

    // ===== POST-PROCESSING: Auto ADD_EMPLOYEE + ADD_CUSTOMER + Sort =====
    const addedEmployees = new Set<string>();
    for (const a of rawActions) {
      if (a.intent === 'ADD_EMPLOYEE') addedEmployees.add((a.extractedData.employeeName as string)?.trim() || '');
    }
    const autoAdd: typeof rawActions = [];
    const ensureEmployee = (name: string, sourceIntent: string) => {
      const n = name?.trim();
      if (!n || addedEmployees.has(n)) return;
      addedEmployees.add(n);
      let jobTitle = 'عامل';
      if (sourceIntent === 'INVENTORY_WITHDRAWAL') jobTitle = 'فني';
      autoAdd.push({
        intent: 'ADD_EMPLOYEE',
        extractedData: { employeeName: n, jobTitle, baseRate: 0, salaryType: 'DAILY', autoAttendance: true },
        description: `إضافة موظف "${n}" — ${jobTitle} (مضاف تلقائياً)`,
      });
    };

    const addedParties = new Set<string>();
    const ensureCustomer = (name: string) => {
      const n = name?.trim();
      if (!n || addedParties.has(n) || /طرف\s*\(/.test(n)) return;
      addedParties.add(n);
      autoAdd.push({
        intent: 'ADD_CUSTOMER',
        extractedData: { partyIdentifier: n, phone: '0000000000' },
        description: `إضافة طرف "${n}" كعميل/مورد`,
      });
    };

    for (const a of rawActions) {
      if (a.intent === 'EMPLOYEE_ATTENDANCE') ensureEmployee(a.extractedData.employeeName as string, a.intent);
      if (a.intent === 'EMPLOYEE_ADVANCE') ensureEmployee(a.extractedData.employeeName as string, a.intent);
      if (a.intent === 'INVENTORY_WITHDRAWAL') ensureEmployee(a.extractedData.employeeName as string, a.intent);
      if (a.intent === 'SETTLEMENT') ensureCustomer(a.extractedData.partyIdentifier as string);
    }

    const allActions = [...autoAdd, ...rawActions];
    const actionOrder = [
      'ADD_EMPLOYEE', 'ADD_CUSTOMER', 'ADD_INVENTORY',
      'EMPLOYEE_ATTENDANCE', 'INVENTORY_WITHDRAWAL',
      'SALE', 'ORDER', 'EMPLOYEE_ADVANCE',
      'SETTLEMENT', 'EXPENSE', 'RETURN_TO_INVENTORY',
      'SERVICE_ORDER', 'UNKNOWN',
    ];
    allActions.sort((a, b) => {
      const ia = actionOrder.indexOf(a.intent);
      const ib = actionOrder.indexOf(b.intent);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    if (allActions.length > 0) {
      return {
        intent: 'MULTI_ACTION',
        extractedData: { actions: allActions },
        reply: `فهمت الرسالة واستخرجت منها ${allActions.length} أوامر:\n${allActions.map((a, i) => `${i + 1}. ${a.description}`).join('\n')}\n\nيرجى تأكيد التنفيذ.`,
        requiresConfirmation: true,
      };
    }
    return {
      intent: 'UNKNOWN',
      extractedData: {},
      reply: 'لم أفهم الطلب. يرجى كتابة الأوامر بشكل واضح.',
      requiresConfirmation: false,
    };
  }
}
