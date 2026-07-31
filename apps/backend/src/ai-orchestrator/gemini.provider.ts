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

=== التصنيفات (13 intent):
- ADD_INVENTORY: إضافة منتج للمخزون (طقم مفكات ألماني بسعر 350 الكود بتاعه Tool-01 / 5 كراتين محولات 12 فولت الكرتونة فيها 10 القطعة القطاعي 150 كود PWR-12)
- SALE / ORDER: بيع أو أوردر بيع
- SETTLEMENT: تسوية مالية (دفعة / مديونية / خصم للعميل / سداد مورد). استلمنا X من Y تحت الحساب = CREDIT لـ "Y" كامل. خصم للعميل = DEBIT. باقي فاتورة مؤجل = DEBIT. سداد مورد (حولنا للمورد س Y) = DEBIT لـ Y.
- EXPENSE: مصروف فعلي فقط (فاتورة كهرباء / غداء عمال / شحن بنزين / هالك وتالف) — المنتجات للسحوبات والعهدة والسلفة والمخزون مش مصروفات أبداً.
- RETURN_TO_INVENTORY: إرجاع منتج للمخزن
- ADD_EMPLOYEE: إضافة موظف (عامل جديد اسمه (عاطف الشرقاوي) وظيفته فني كهرباء ورقم تليفونه 01xxxxxxx). لا تحذف رقم التليفون (احفظه phone)، ولا تحسبه كمبلغ لأي شيء.
- EMPLOYEE_ATTENDANCE: حضر (PRESENT) / غاب (ABSENT) / متأخر أو استأذن خلاص الساعة 2 (HALF_DAY) / غاب بدون إذن (ABSENT + خصم يوم DEDUCTION)
- EMPLOYEE_ADVANCE: سلفة / مكافأة / خصم لموظف
- INVENTORY_WITHDRAWAL: عهدة ومسحوبات موظف من المخزون (موظف X أخذ 2 محول وطقم شانيور — لازم استخرج كل منتج في withdrawal لوحده).
- ADD_CUSTOMER: إضافة عميل / مورد جديد
- MULTI_ACTION: أكثر من أمر
- UNKNOWN

=== القواعد الإلزامية (مهم جدًا):
1. رد بالعربي
2. **أسماء كاملة ولا تقطع أبدًا**: "شركة الأمل" لا تُقطع "الع"، "أستاذ سامح" كامل، "شركة التقنية" كامل، "مدير الفندق أستاذ سامح" → الطرف "أستاذ سامح".
3. **الترتيب الإجباري للأوامر**: ADD_EMPLOYEE → ADD_CUSTOMER → ADD_INVENTORY → EMPLOYEE_ATTENDANCE → INVENTORY_WITHDRAWAL → SALE → EMPLOYEE_ADVANCE → SETTLEMENT → EXPENSE → RETURN_TO_INVENTORY
4. لو ذكر اسم موظف/عميل في أي أمر ومش موجود في الإضافات → أضف ADD_EMPLOYEE / ADD_CUSTOMER أولًا تلقائيًا.
5. **الـ aliases (أهم شيء)**: "أبو علي (اللي هو سيف الدين)" → الحقيقي هو "سيف الدين" و"أبو علي" alias بيه. "الأسطة عاطف ده" = عاطف الشرقاوي اللي اتضاف قبل كده. "الأسطة" و"أستاذ" و"باشا" و"ابو/أبو" و"عم" و"ده/دي" كلها titles تشال من الاسم.
6. **الـ clauses المعقدة**: لو جملة واحدة فيها أكتر من فعل (حضر + سلفة، أو عهدة + رجوع + بديل + هالك) → افصلها لأكتر من action.
7. **أرقام التليفون**: أي رقم يبدأ بـ 01 وطوله 11 رقم = تليفون. تزود في الـ ADD_EMPLOYEE / ADD_CUSTOMER في phone. لا تحسبه أبدًا كمبلغ لأي EXPENSE أو ADVANCE أو SETTLEMENT.
8. **الأفرتايم**: "حضر وأخد 3 ساعات أفرتايم" = EMPLOYEE_ATTENDANCE PRESENT مش INVENTORY_WITHDRAWAL على الإطلاق.
9. **الـ wholesale / قطاعي في المخزون**: سعر شراء الكرتونة = cost_price، سعر بيع القطعة القطاعي = unit_price، الكمية = عدد الكراتين × عدد القطع في الكرتونة (إذا معطى). كود المنتج = SKU.
10. **التالف / الهالك / Scrap**: "محول تالف سجله في الهالك" = EXPENSE expenseCategory: "أخرى" مع ملاحظة "هالك/تالف" لو أمكن.
11. **دفعة + خصم + باقي مؤجل في نفس clause**: افصل 3 تسويات منفصلة: دفعة سداد (CREDIT) + خصم / حسم (DEBIT) + باقي مؤجل (DEBIT).

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
      'SETTLEMENT', 'EXPENSE', 'RETURN_TO_INVENTORY', 'UNKNOWN',
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
    const step1 = text.split(/\s*(?:[.۔\n\r؛;]|(?=أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|أخيراً|بالنسبة لـ))\s*/);
    const result: string[] = [];
    const prefixesRe = /(?:وسجل|وكمان|واخصم|وسأضف|ور[جچ]ّ?ع|وحول|ونحوّل|وادفع|و[أإا]?ضف|و[أإا]?خذ|و[أإا]خد|وبعد|وسحب|و[أإا]?ستلم|وأخيراً|وبعدها)\s+/g;
    const protectedWords = ['ووظيفته', 'ووظيفة', 'واسمه', 'وباسم', 'بوظيفة', 'وعشان', 'عشان', 'وبس', 'وظيفته', 'واحد جديد', 'وفودافون كاش', 'و 2 محول', 'و 2 محولات'];
    for (const raw of step1) {
      const trimmed = raw.trim().replace(/^[،,:\s]+/, '').replace(/[،,:\s]+$/, '');
      if (trimmed.length <= 5) continue;
      let safe = trimmed;
      const placeholders: Record<string, string> = {};
      let counter = 0;
      for (const w of protectedWords) {
        if (safe.includes(w)) {
          const key = `\u0002${counter++}\u0002`;
          placeholders[key] = w;
          safe = safe.split(w).join(key);
        }
      }
      const splitParts: string[] = [];
      let lastIndex = 0;
      let match;
      const re = new RegExp(prefixesRe.source, prefixesRe.flags);
      while ((match = re.exec(safe)) !== null) {
        if (match.index > lastIndex) {
          splitParts.push(safe.slice(lastIndex, match.index).trim());
        }
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < safe.length) splitParts.push(safe.slice(lastIndex).trim());
      for (const part of (splitParts.length > 0 ? splitParts : [safe])) {
        let restored = part;
        for (const [k, v] of Object.entries(placeholders)) {
          restored = restored.split(k).join(v);
        }
        restored = restored.replace(/^[،,\sو]+/, '').trim();
        if (restored.length > 5) result.push(restored);
      }
    }
    const multiEventMarkers: Array<{ re: RegExp; min: number }> = [
      { re: /(حضر|غاب|غياب|متأخر|استأذن)/g, min: 1 },
      { re: /(سلفة|خصم|مكافأة)/g, min: 1 },
      { re: /(أخذ|اخد|أخد|عهدة)/g, min: 1 },
    ];
    const finalClauses: string[] = [];
    for (const clause of result) {
      const hasEvents = clause.length >= 50 && multiEventMarkers.some(({ re, min }) => {
        const matches = clause.match(re);
        return matches && matches.length > min;
      });
      const hasAliases = /\([^)]*\)/.test(clause) && clause.length > 50;
      if (hasEvents || hasAliases) {
        const subParts = clause.split(/[،,]\s*(?=\S)/);
        let buf = '';
        for (let i = 0; i < subParts.length; i++) {
          let p = subParts[i].trim().replace(/^[،,\sو]+/, '').replace(/[،,\s]+$/, '');
          if (buf && /^(?:بس|لأن|عشان|عشان|بعد|وبعد|لكن)/.test(p)) {
            buf += '، ' + p;
            continue;
          }
          if (buf.length > 5) finalClauses.push(buf);
          buf = p;
        }
        if (buf.length > 5) finalClauses.push(buf);
      } else {
        finalClauses.push(clause);
      }
    }
    return finalClauses.filter((c) => c.length > 5);
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
    const productSplit = cleanClause.split(/[،,]\s*(?=\d+\s+(?:كراتين|كرتون|كرات|طقم|أطقم|قطعة|كيلو|متر|صندوق|شانيور)|\b(?:وكمان|و\s*دخلنا|و\s*ايضاً)\s+|\b(?:اعطِ|اعطي)\s+)/i).filter((p) => p.trim().length > 3);
    if (productSplit.length === 0) productSplit.push(cleanClause);

    for (let rawPart of productSplit) {
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

      const skuMatch = part.match(/(?:كود|SKU|الكود)\s*(?:بتاعه|بتاع|:|هو|للمنتج|ده|دي|المتعلق)?\s*([A-Za-z0-9_\-]+)/i);
      const sku = skuMatch ? skuMatch[1].toUpperCase() : `SKU-${Math.floor(1000 + Math.random() * 9000)}`;

      let productName = part;
      productName = productName
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
      if (!productName) productName = 'منتج مخزون جديد';

      results.push({ name: productName, sku, current_stock: quantity, unit_price: unitPrice, cost_price: costPrice });
    }
    return results;
  }

  private parseMultipleWithdrawalsFromClause(clause: string): Array<{ productName: string; quantity: number }> {
    const products: Array<{ productName: string; quantity: number }> = [];
    let tail = clause.replace(/^.*?(?:أخذ|اخد|أخد|ليه عهدة|عنده عهدة|مسحوبات|عهدة)\s*/, '');
    tail = tail.replace(/\s*(?:عشان|لـ|لعمل|لمشروع|للعمل)\s+.*$/s, '').trim();
    const segMatches = tail.split(/[،,]\s*و\s+|\s+و\s+(?=\d+)/).map((s) => s.trim()).filter(Boolean);
    for (const seg of segMatches) {
      const qtyMatch = seg.match(/(\d+(?:\.\d+)?)\s*(?:كرتون|قطعة|طقم|متر|كيلو|صندوق|عدد|واحد|واحدة|محول|محولات|شانيور|كابل|مفكات)?/i);
      const qty = qtyMatch ? parseFloat(qtyMatch[1]) : 1;
      let productName = seg
        .replace(/(\d+(?:\.\d+)?)\s*(?:كرتون|قطعة|طقم|متر|كيلو|صندوق|عدد|واحد|واحدة)/gi, '')
        .replace(/^\s*(?:بدال|بديل|واحد)[\sو،,]*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      productName = productName.replace(/^[،,\sو]+|[،,\sو]+$/g, '');
      if (!productName) productName = 'منتج مسحوب';
      const exist = products.find((p) => p.productName.toLowerCase() === productName.toLowerCase());
      if (exist) exist.quantity += qty;
      else products.push({ productName, quantity: qty });
    }
    if (products.length === 0 && tail.length > 1) {
      products.push({ productName: tail.trim(), quantity: 1 });
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

    for (let idx = 0; idx < clauses.length; idx++) {
      const clause = clauses[idx];

      const phone = this.extractPhone(clause);

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

      // ===== RETURN_TO_INVENTORY + SCRAP detection (process first within withdrawal-type clauses) =====
      const hasReturn = /رجّع|ارجع|إرجاع|ارجاع|رجعت|مرتجع|رجع/.test(clause);
      const hasScrap = /هالك|تالف|صفراء|خردة|scrap|محرق|محروق|معطل|اتلف/i.test(clause);
      const hasExchange = /بدال|بديل|واحد جديد|بداله|يستبدل|استبدال/.test(clause);
      if (hasReturn) {
        const qtyMatch = clause.match(/(\d+(?:\.\d+)?)\s*(?:كيلو|متر|قطعة|جم|طن|لتر|منهم|منو|منها|واحد|واحدة|كرتون|طقم)?/);
        const qty = qtyMatch ? parseFloat(qtyMatch[1]) : 1;
        const beforeVerb = clause.slice(0, Math.max(0, clause.search(/رجّع|ارجع|إرجاع|ارجاع|رجعت|مرتجع|رجع/)));
        const empMatch = beforeVerb.match(/([\u0600-\u06FFa-zA-Z\s]{3,40}?)(?:\s*،\s*|\s+بس\s+|\s+بعد|$)/);
        const productArea = clause.replace(/.*?(?:رجّع|ارجع|إرجاع|ارجاع|رجعت|مرتجع|رجع)\s*/, '');
        let productName = productArea
          .replace(/(?:للمخزن|للمخزون|المخزن|المخزون)/gi, '')
          .replace(/(?:عشان|لأن|لكن|بعد|وبعد)\s+.*$/s, '')
          .replace(/\d+(?:\.\d+)?/g, '')
          .replace(/[،,:]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
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
        continue;
      }

      // ===== INVENTORY_WITHDRAWAL =====
      const hasWithdrawal =
        (clause.includes('أخذ') || clause.includes('اخد') || clause.includes('عهدة') || clause.includes('مسحوبات')) &&
        !clause.includes('سلفة') &&
        !clause.includes('خصم') &&
        !clause.includes('من الخزنة') &&
        !clause.includes('مصروف') &&
        !clause.includes('فاتورة') &&
        !/أفرتايم|ساعات\s+(?:عمل|مضى)|ساعة(\s+)?\d/.test(clause);
      if (hasWithdrawal) {
        const whoMatch = clause.match(/(?:^|[\s،,])([\u0600-\u06FFa-zA-Z\s]{3,40}?)\s+(?:أخذ|اخد|أخد|ليه عهدة|عنده عهدة|عهدة|مسحوبات)\s+/);
        let employeeName = whoMatch ? resolveName(whoMatch[1]) : '';
        if (!employeeName) employeeName = lastNames[0] || '';
        if (employeeName) {
          registerEmployee(employeeName, [employeeName.split(/\s+/)[0]]);
          const items = this.parseMultipleWithdrawalsFromClause(clause);
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
      const looksAddInventory =
        clause.includes('للمخزون') || clause.includes('للمخزن') || clause.includes('ضف للمخزون') || clause.includes('أضف للمخزون') || clause.includes('إضافة للمخزون') ||
        clause.includes('منتج جديد') || clause.includes('بضاعة جديدة') || clause.includes('منتجات جديدة دخلت المخزن') || clause.includes('شحنة جديدة') || clause.includes('دخلنا') && /(?:محول|شانيور|مفكات|كابل|كرتون|كراتين|طقم|قطعة)/.test(clause) ||
        clause.includes('الكود بتاعه') ||
        (/سعر/.test(clause) && /(?:طقم|كابل|كيلو|قطعة|متر|صندوق|جم|طن|لتر|كرتون|كراتين|شانيور|محولات)/.test(clause));
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

      // ===== EMPLOYEE_ATTENDANCE (+ optional DEDUCTION for absent-without-permission) =====
      const looksAttendance =
        clause.includes('حضور') || clause.includes('سجل حضور') || clause.includes('حضر') ||
        clause.includes('غياب') || clause.includes('غاب') || clause.includes('متأخر') ||
        clause.includes('استأذن') || clause.includes('إذن') || /ساعة\s*\d/.test(clause);
      if (looksAttendance) {
        const subBlocks = clause.split(/[،,]\s*/).filter((b) =>
          /حضر|غاب|غياب|غائب|متأخر|استأذن|إذن|حضور/.test(b),
        );
        for (const block of (subBlocks.length > 0 ? subBlocks : [clause])) {
          const attMatch = block.match(/([\u0600-\u06FFa-zA-Z\s]{3,40}?)\s+(حضر|غاب|غياب|غائب|متأخر|حضور|استأذن|إذن)/);
          if (!attMatch) continue;
          const rawName = attMatch[1];
          const empName = resolveName(rawName);
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

      // ===== EMPLOYEE_ADVANCE: سلفة / خصم / مكافأة / من الخزنة كاش =====
      const looksAdvance =
        clause.includes('سلفة') || clause.includes('اخصم') || (clause.includes('خصم') && !looksAttendance) || clause.includes('مكافأة') ||
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

      // ===== SETTLEMENT: تسوية / مديونية / سداد / دفعة / استلم / تحت الحساب / حولنا للمورد / خصم للعميل / باقي مؤجل =====
      const containsAnyMoney = /\b\d{3,8}\b/.test(clause) && !this.isPhone(clause);
      const looksSettlement = (
        clause.includes('مديونية') || clause.includes('تسوية') || clause.includes('سداد') ||
        clause.includes('دفعة') || clause.includes('عليه') || clause.includes('مدين') ||
        clause.includes('استلم') || clause.includes('قبض') || clause.includes('تحت الحساب') ||
        (clause.includes('خصم') && (clause.includes('للعميل') || clause.includes('له'))) ||
        /باقي\s*(?:فاتورة|حساب|المبلغ|متبقي)\s*(?:مؤجل|على\s+الحساب)?/.test(clause) ||
        ((clause.includes('حولنا') || clause.includes('تحويل')) && (clause.includes('لمورد') || clause.includes('لعميل') || clause.includes('لـ') || /شركة|أستاذ|فندق/.test(clause)))
      ) && containsAnyMoney;
      if (looksSettlement) {
        const parts = clause.split(/[،,]\s*(?=\b(?:وعملنا|وتستحق|و\s*خصم|و\s*باقي|و\s*دفعة|و\s*تحت|و\s*استلم|و\s*حولنا)\b)/).map((s) => s.trim()).filter(Boolean);
        for (const part of (parts.length ? parts : [clause])) {
          const { amount } = this.parseMoneyAmount(part);
          if (amount <= 0) continue;

          const isDebit =
            /عليه|مديونية|مدين|مديون|خصم.*(?:للعميل|له|بسبب)|باقي\s*(?:فاتورة|حساب|مؤجل|مستحق)|مستحق|مدين|متبقي/.test(part)
            || (/حولنا|تحويل|سداد/.test(part) && /(?:لمورد|للمورد|لـ\s*شركة|المورد)/.test(part));
          const entryType: 'CREDIT' | 'DEBIT' = isDebit ? 'DEBIT' : 'CREDIT';

          let partyIdentifier = '';
          const pm = part.match(/(?:من\s+|لـ\s*|للمورد\s+|لمورد\s+|للعميل\s+|للزبون\s+|عميل\s+|على\s+|له\s+)"?\s*'?\s*(?:مدير\s+)?(?:الفندق\s+)?([\u0600-\u06FFa-zA-Z][\u0600-\u06FFa-zA-Z0-9\s\-]{2,40}?)\s*['"]?\s*(?=\bمبلغ|\bجنيه|\bج\.م|\bكاش|\bدفعة|\bتحت\s+الحساب|\bبسبب|\$|\d|$|[،,])/);
          if (pm) partyIdentifier = pm[1].trim();
          if (!partyIdentifier) {
            const pm2 = part.match(/["']([\u0600-\u06FFa-zA-Z][^"']{2,40})["']/);
            if (pm2) partyIdentifier = pm2[1].trim();
          }
          if (!partyIdentifier) partyIdentifier = isDebit ? 'طرف (مديونية/خصم)' : 'طرف (سداد)';

          if (/خصم\s*\d+|خصم.*للطرف|خصم.*(?:للعميل|له)/.test(part)) {
            pushAction({
              intent: 'SETTLEMENT',
              extractedData: { partyIdentifier, entryType: 'DEBIT', amount, notes: 'خصم / حسم / تخفيض' },
              description: `تسجيل خصم / حسم على حساب "${partyIdentifier}" بمبلغ ${amount} ج.م`,
            });
          } else if (/باقي\s*(?:فاتورة|حساب|متبقي)\s*(?:مؤجل|مستحق)/.test(part)) {
            pushAction({
              intent: 'SETTLEMENT',
              extractedData: { partyIdentifier, entryType: 'DEBIT', amount, notes: 'باقي فاتورة مؤجل' },
              description: `تسجيل باقي فاتورة مؤجل بمبلغ ${amount} ج.م على حساب "${partyIdentifier}"`,
            });
          } else {
            pushAction({
              intent: 'SETTLEMENT',
              extractedData: { partyIdentifier, entryType, amount },
              description: `تسجيل ${isDebit ? 'مديونية على' : 'سداد لـ'} "${partyIdentifier}" بمبلغ ${amount} ج.م`,
            });
          }
        }
        continue;
      }

      // ===== EXPENSE: مصروفات فقط (غداء عمال، شحن بنزين، فواتير، هالك/تالف) =====
      const looksExpense =
        clause.includes('فاتورة') ||
        clause.includes('مصروف') ||
        clause.includes('غداء') || clause.includes('عشاء') || clause.includes('فطور') || clause.includes('سحور') || clause.includes('افطار') ||
        (clause.includes('شحن') && (clause.includes('بنزين') || clause.includes('وقود') || clause.includes('عربية'))) ||
        clause.includes('بنزين') || clause.includes('وقود') ||
        /صرفنا\s+من\s+(?:الخزنة|الصندوق)/.test(clause) ||
        hasScrap;
      if (looksExpense) {
        const { amount } = this.parseMoneyAmount(clause);
        let category = 'أخرى';
        if (/كهرباء/.test(clause)) category = 'كهرباء';
        else if (/مياه/.test(clause)) category = 'مياه';
        else if (/موبايل|فودافون|نت|إنترنت|اتصالات|وي/.test(clause) && !/كاش/.test(clause)) category = 'موبايل';
        else if (/إيجار|ايجار/.test(clause)) category = 'إيجار';
        else if (/غداء|عشاء|فطور|سحور|افطار|وجبة|مطعم/.test(clause)) category = 'أخرى';
        else if (/بنزين|وقود|شحن.*عربية|نقل|سفر|diesel|ديزل/.test(clause)) category = 'نقل';
        else if (/مورد|فودافون\s*كاش/.test(clause)) category = 'موردين';
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
      'SETTLEMENT', 'EXPENSE', 'RETURN_TO_INVENTORY', 'UNKNOWN',
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
