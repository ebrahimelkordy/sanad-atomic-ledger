import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  AIProvider,
  ClassifyAndExtractResult,
  TenantAIContext,
  ProcessChatResult,
} from './ai-provider.interface';

@Injectable()
export class OpenAIProvider implements AIProvider {
  private readonly logger = new Logger(OpenAIProvider.name);
  private openai: OpenAI;

  private static readonly ACTION_ORDER = [
    'ADD_EMPLOYEE', 'ADD_CUSTOMER', 'ADD_INVENTORY',
    'EMPLOYEE_ATTENDANCE', 'INVENTORY_WITHDRAWAL',
    'SALE', 'ORDER', 'EMPLOYEE_ADVANCE',
    'SETTLEMENT', 'EXPENSE', 'RETURN_TO_INVENTORY',
    'SERVICE_ORDER', 'UNKNOWN',
  ];

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY') || '';
    this.openai = new OpenAI({ apiKey });
  }

  async classifyAndExtract(
    messageText: string,
    tenantContext: TenantAIContext,
  ): Promise<ClassifyAndExtractResult> {
    const systemPrompt = `You are an AI assistant for a business of type: ${tenantContext.verticalType}.
Analyze the following WhatsApp message from a customer or manager.
Classify the intent into one of three categories: "ORDER", "SETTLEMENT", or "UNKNOWN".

If the intent is "ORDER", extract the items requested.
If the intent is "SETTLEMENT", extract the party identifier (name or phone — FULL NAME, NEVER shorten it!), the entry type ("CREDIT" or "DEBIT"), and the amount.

Return ONLY a valid JSON object with the following schema:
{
  "intent": "ORDER" | "SETTLEMENT" | "UNKNOWN",
  "extractedData": {
    "items": [{"productNameOrSku": "string", "quantity": 1}],
    "partyIdentifier": "string (FULL NAME — e.g. 'شركة الأمل' NOT 'الع')",
    "entryType": "CREDIT" | "DEBIT",
    "amount": 0
  }
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: messageText },
        ],
        response_format: { type: 'json_object' },
      });

      const responseText = response.choices[0].message.content || '{}';
      const parsed = JSON.parse(responseText) as ClassifyAndExtractResult;
      return parsed;
    } catch (error) {
      this.logger.error('Failed to classify message using OpenAI', error);
      return { intent: 'UNKNOWN', extractedData: {} };
    }
  }

  async processChat(
    messageText: string,
    tenantContext: TenantAIContext,
    _attachments?: Array<{ mimeType: string; base64Data: string }>,
  ): Promise<ProcessChatResult> {
    const systemPrompt = `أنت مساعد ذكي لنظام إدارة أعمال اسمه "سند".
نوع نشاط التاجر: ${tenantContext.verticalType}.

مهمتك هي تحليل الرسائل وتصنيفها إلى:
- ADD_INVENTORY: إضافة منتج للمخزون (مثل: 5 كراتين محولات 12 فولت الكرتونة فيها 10 قطع سعر شراء الكرتونة 1200 وسعر بيع القطعة القطاعي 150 كود PWR-12 → الكمية=50، cost_price=120، unit_price=150، SKU=PWR-12)
- SALE: تسجيل عملية بيع لعميل
- ORDER: طلب شراء أو أوردر منتجات
- SETTLEMENT: تسجيل مديونية أو دفعة أو تسوية مالية. استلمنا X من Y تحت الحساب = CREDIT لـ "Y" كامل. خصم للعميل = DEBIT. باقي فاتورة مؤجل = DEBIT. سداد مورد (حولنا للمورد شركة التقنية 3000 من فودافون كاش) = DEBIT لـ "شركة التقنية".
- EXPENSE: مصروف فعلي فقط (فاتورة كهرباء / غداء عمال / شحن بنزين / هالك وتالف) — المنتجات للسحوبات والعهدة والسلفة والمخزون مش مصروفات أبداً.
- RETURN_TO_INVENTORY: إرجاع منتج للمخزون
- ADD_EMPLOYEE: إضافة موظف جديد بالاسم والوظيفة والراتب مع تفعيل الحضور التلقائي + phone لحقل التليفون (صيغ: "عامل جديد اسمه (عاطف الشرقاوي) ووظيفته فني كهرباء ورقم تليفونه 01xxxxxxx")
- EMPLOYEE_ATTENDANCE: تسجيل حضور (PRESENT) أو غياب (ABSENT) أو تأخير/استئذان (HALF_DAY). غاب بدون إذن → ABSENT + EMPLOYEE_ADVANCE DEDUCTION ليوم واحد.
- EMPLOYEE_ADVANCE: سلفة (ADVANCE) أو خصم (DEDUCTION) أو مكافأة (BONUS) لموظف
- INVENTORY_WITHDRAWAL: عهدة ومسحوبات موظف من المخزون (موظف X أخذ 2 محول وطقم شانيور — استخرج كل منتج في withdrawal لوحده)
- ADD_CUSTOMER: إضافة عميل / مورد / داعم / متبرع / مستفيد / مقدم خدمة جديد
- SERVICE_ORDER: افتح طلب خدمة/صيانة / سند جديد (الحقول: title=الاسم، category=التصنيف، priority=الأولوية (عاجل/عادي)، leadTechnician=الفني الرئيسي أو مقدم الخدمة، assistantTechnician=المساعد أو الأدمن المسؤول)
- MULTI_ACTION: عندما يحتوي الطلب على أكثر من أمر واحد
- UNKNOWN: رسالة عامة أو استفسار

=== قواعد مهمة جداً (لازم تطبقها):
1. رد دايماً بالعربي وبأسلوب ودي ومهني
2. لو طلب المستخدم يحتوي على أوامر متعددة استخرجها كـ MULTI_ACTION مع أوبجكت actions كامل — مهم جداً لا تجمع أكثر من أمر في واحدة
3. **فرز أوامر إجباري:** ADD_EMPLOYEE → ADD_CUSTOMER → ADD_INVENTORY → EMPLOYEE_ATTENDANCE → INVENTORY_WITHDRAWAL → SALE/ORDER → EMPLOYEE_ADVANCE → SETTLEMENT → EXPENSE → RETURN_TO_INVENTORY → SERVICE_ORDER
4. لو ذكر اسم موظف في أي أمر ومش موجود → أضف ADD_EMPLOYEE أولًا تلقائياً (وظيفة افتراضية "عامل")
5. لو ذكر اسم عميل/مورد/داعم في التسوية ولم يكن موجود → أضف ADD_CUSTOMER أولًا
6. **aliases و titles:** "أبو علي (اللي هو سيف الدين)" → الاسم الحقيقي هو "سيف الدين" دائماً و"أبو علي" هو alias. "الأسطة عاطف ده" = عاطف الشرقاوي. كلمات مثل "الأسطة", "أستاذ", "باشا", "ابو/أبو", "عم", "ده/دي" كلها titles تشال من الاسم. **مهم جداً: "حضر بس" = الفعل حضر + كلمة بس، مش جزء من اسم الموظف اطلاقاً.**
7. **الـ clauses المعقدة:** لو جملة واحدة فيها أكتر من فعل → افصلها لأكتر من action. لو فيه "أخذ X و Y وبعد رجّع X وسحب بداله وتالف" → استخرج: (1) مسحوبات X و Y، (2) إرجاع X، (3) بديل/مسحوبة X الجديدة، (4) هالك/تالف X. لا تحذف المسحوبات الأصلية أبداً.
8. **دفعة + خصم + باقي مؤجل لنفس الطرف:** افصلهم 3 SETTLEMENT منفصلة: (1) دفعة سداد CREDIT، (2) خصم DEBIT، (3) باقي فاتورة مؤجل DEBIT. لكلهم نفس الطرف.
9. **أرقام التليفون:** أي رقم يبدأ بـ 01 وطوله 11 رقم = تليفون. ضيفه في الحقل phone لـ ADD_EMPLOYEE / ADD_CUSTOMER. لا تحسبه أبداً كمبلغ.
10. **الأفرتايم:** "حضر وأخد 3 ساعات أفرتايم" = EMPLOYEE_ATTENDANCE PRESENT فقط.
11. **المخزن بالجملة:** سعر شراء الكرتونة = cost_price مقسوماً على عدد القطع في الكرتونة لو معطى. سعر بيع القطعة القطاعي = unit_price. الكمية = عدد الكراتين × عدد القطع في الكرتونة.
12. **الهالك والتالف:** "محول محروق سجله في الهالك" = EXPENSE category "أخرى" مع notes "هالك/تالف/scrap".

أرجع JSON حرفياً بالـ schema ده:
{
  "intent": "ADD_INVENTORY|SALE|ORDER|SETTLEMENT|EXPENSE|RETURN_TO_INVENTORY|ADD_EMPLOYEE|EMPLOYEE_ATTENDANCE|EMPLOYEE_ADVANCE|INVENTORY_WITHDRAWAL|ADD_CUSTOMER|SERVICE_ORDER|MULTI_ACTION|UNKNOWN",
  "reply": "الرد بالعربي",
  "requiresConfirmation": true,
  "extractedData": {
    "actions": [
      {
        "intent": "...",
        "description": "وصف الأمر بالعربي",
        "extractedData": { ... حقول هذا النوع من الأوامر ... }
      }
    ]
  }
}

الرسالة للمستخدم: "${messageText}"`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: messageText },
        ],
        response_format: { type: 'json_object' },
      });

      const responseText = response.choices[0].message.content || '{}';
      const parsed = JSON.parse(responseText);
      const normalized = this.normalizeSchemaAndOrder(parsed);
      return {
        intent: normalized.intent || 'UNKNOWN',
        extractedData: normalized.extractedData || {},
        reply: normalized.reply || 'تم استلام رسالتك.',
        requiresConfirmation: normalized.requiresConfirmation ?? (normalized.intent !== 'UNKNOWN'),
      };
    } catch (error) {
      this.logger.error('OpenAI processChat failed', error);
      return {
        intent: 'UNKNOWN',
        extractedData: {},
        reply: 'عذراً، حدث خطأ في معالجة رسالتك. يرجى المحاولة مرة أخرى.',
        requiresConfirmation: false,
      };
    }
  }

  private normalizeExtractedDataForIntent(
    intent: string,
    raw: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { ...(raw || {}) };
    const pickStr = (keys: string[]): string => {
      for (const k of keys) if (raw && typeof raw[k] === 'string' && raw[k].trim()) return raw[k].trim();
      return '';
    };
    const pickNum = (keys: string[]): number => {
      for (const k of keys) {
        if (raw && raw[k] !== undefined && raw[k] !== null) {
          const n = Number(raw[k]);
          if (!isNaN(n)) return n;
        }
      }
      return 0;
    };

    switch (intent) {
      case 'ADD_EMPLOYEE': {
        const name = pickStr(['employeeName', 'name', 'employee_name', 'empName', 'fullName', 'اسم_الموظف', 'employeeId', 'empId', 'id']);
        const job = pickStr(['jobTitle', 'job', 'job_title', 'role', 'function', 'jobtitle', 'صلاحية', 'permission', 'وظيفة']) || 'عامل';
        out.employeeName = name;
        out.jobTitle = job;
        out.baseRate = pickNum(['baseRate', 'rate', 'salary', 'راتب', 'base_rate', 'wage']);
        const typeRaw = (pickStr(['salaryType', 'salary_type', 'salarytype']) || '').toUpperCase();
        out.salaryType = typeRaw === 'MONTHLY' ? 'MONTHLY' : 'DAILY';
        const autoVal = raw && 'autoAttendance' in raw ? raw['autoAttendance'] : raw['auto_attendance'];
        out.autoAttendance = autoVal === undefined ? true : Boolean(autoVal);
        const ph = pickStr(['phone', 'mobile', 'telephone', 'contact', 'رقم', 'phoneNumber', 'contactNumber']);
        if (ph) out.phone = ph;
        break;
      }
      case 'ADD_CUSTOMER': {
        const name = pickStr(['partyIdentifier', 'party', 'name', 'customer', 'customerName', 'supplier', 'donor', 'beneficiary', 'partyId', 'اسم_العميل', 'الاسم']);
        if (name) out.partyIdentifier = name;
        if (!out.name && name) out.name = name;
        const ph = pickStr(['phone', 'mobile', 'telephone', 'contact', 'phoneNumber', 'contactNumber', 'رقم_التواصل']);
        if (ph) out.phone = ph;
        break;
      }
      case 'ADD_INVENTORY': {
        let prodName = pickStr(['name', 'productName', 'product_name', 'item', 'product', 'اسم_المنتج', 'productId', 'itemId', 'id', 'الصنف', 'المنتج', 'البضاعة']);
        if (!prodName) {
          const m = Object.entries(raw).map(([k, v]) => typeof v === 'string' ? `${k}:${v}` : '').join(' ');
          const namePatterns = [
            /محولات?[\s\u0600-\u06FF0-9\-]*فولت?[\s\u0600-\u06FF0-9]*\b/i,
            /شانيور[\s\u0600-\u06FF0-9\w]*\b/i,
            /أطقم?[\s\u0600-\u06FF]*شانيور[\s\u0600-\u06FF0-9\w]*\b/i,
            /نظارة[\s\u0600-\u06FF]*\b/i,
            /(?:منتج|بضاعة|صنف)[\s\u0600-\u06FF]*["'']?([\u0600-\u06FFa-zA-Z0-9\s\-]{3,60}?)["'']?(?:\s*[,،.]|\s*الكمية|\s*سعر|\s*كود|\s*$)/i,
          ];
          for (const re of namePatterns) {
            const match = m.match(re);
            if (match) {
              prodName = (match[1] || match[0]).trim();
              break;
            }
          }
          if (!prodName) {
            const strings = Object.values(raw).filter((v): v is string => typeof v === 'string' && v.trim().length > 3 && v.trim().length < 80);
            for (const s of strings) {
              const trimmed = s.trim();
              if (/[\u0600-\u06FF]/.test(trimmed) && trimmed !== 'PWR-12' && !trimmed.startsWith('SKU-') && !/^01[0-9]{9}$/.test(trimmed)) {
                if (!/^[0-9]+$/.test(trimmed) && !/حضور|غياب|إجازة|PRESENT|ABSENT|HALF|ADVANCE|CREDIT|DEBIT/i.test(trimmed)) {
                  prodName = trimmed;
                  break;
                }
              }
            }
          }
        }
        out.name = prodName;
        out.sku = pickStr(['sku', 'SKU', 'code', 'كود', 'كود_المنتج']) || `SKU-${Math.floor(1000 + Math.random() * 9000)}`;
        let stock = pickNum(['current_stock', 'currentStock', 'stock', 'quantity', 'qty', 'كمية', 'count', 'available']);
        if (!stock || stock <= 0) {
          const cartons = pickNum(['cartons', 'carton_count', 'كراتين', 'كراتين_عدد', 'boxes', 'box_count']);
          const perCarton = pickNum(['per_carton', 'pieces_per_carton', 'perBox', 'pieces_per_box', 'قطع_في_الكرتونة', 'في_الكرتونة']);
          if (cartons > 0 && perCarton > 0) {
            stock = cartons * perCarton;
          } else if (cartons > 0) {
            stock = cartons;
          }
        }
        out.current_stock = stock > 0 ? stock : 1;
        const unit_price = pickNum(['unit_price', 'unitPrice', 'sellPrice', 'sellingPrice', 'salePrice', 'price', 'retailPrice', 'سعر_البيع']);
        out.unit_price = unit_price > 0 ? unit_price : 0;
        let cost_price = pickNum(['cost_price', 'costPrice', 'unit_cost', 'unitCost', 'buyPrice', 'purchasePrice', 'cost', 'تكلفة', 'سعر_الشراء']);
        if (!cost_price || cost_price <= 0) {
          const cartonCost = pickNum(['carton_cost', 'كرتونة_سعر', 'box_price', 'كرتونة_تكلفة']);
          const perCarton = pickNum(['per_carton', 'pieces_per_carton', 'perBox', 'pieces_per_box', 'قطع_في_الكرتونة', 'في_الكرتونة']);
          if (cartonCost > 0 && perCarton > 0) {
            cost_price = Math.round(cartonCost / perCarton);
          } else if (cartonCost > 0) {
            cost_price = cartonCost;
          }
        }
        out.cost_price = cost_price > 0 ? cost_price : 0;
        break;
      }
      case 'INVENTORY_WITHDRAWAL': {
        const rawItems = Array.isArray(raw['items']) ? (raw['items'] as any[]) : [];
        let empName = pickStr([
          'employeeName', 'employee', 'emp', 'employee_name', 'empName',
          'fromEmployee', 'المسؤول', 'by', 'عند', 'لـ', 'لـ_الموظف', 'for_employee',
          'withdrawer', 'technician', 'provider', 'leadTechnician', 'مسؤول', 'الفني',
          'employeeId', 'empId', 'assistantTechnician', 'admin', 'responsible',
        ]);
        if (!empName) {
          const m = Object.values(raw).filter(v => typeof v === 'string').join(' ');
          const p = m.match(/(?:لـ|عند|بواسطة|المسؤول[ء-ي\s]*|الفني[ء-ي\s]*|مقدم[ء-ي\s]*الخدمة[ء-ي\s]*|للطلب[ء-ي\s]*|المتابعة[ء-ي\s]*|ادمن[ء-ي\s]*|عمر[ء-ي\s]*|الدكتور[ء-ي\s]*|الأسطة[ء-ي\s]*)\s*([\u0600-\u06FFa-zA-Z\s]{3,50}?)(?:\s*[،,.]|\s*من|\s*و\s+|\s*في|\s*للطلب|\s*$)/);
          if (p) empName = p[1].trim();
        }
        let prodName = '';
        let qty = 1;
        if (rawItems.length > 0) {
          const firstItem = rawItems.find((it: any) => (it.sku || it.SKU || it.productName || it.name || it.product || it['كود'] || it['اسم_المنتج']) && String(it.sku || it.SKU || it.productName || it.name || it.product || it['كود'] || it['اسم_المنتج']).trim() !== '');
          if (firstItem) {
            prodName = String(firstItem.sku || firstItem.SKU || firstItem.productName || firstItem.name || firstItem.product || firstItem['كود'] || firstItem['اسم_المنتج'] || '').trim();
            qty = Number(firstItem.quantity || firstItem.qty || firstItem.count || 1);
          }
        }
        if (!prodName) {
          const productNameAliases = [
            'productName', 'product', 'item', 'product_name', 'inventoryItem', 'المنتج', 'product_code', 'item_name', 'productId', 'itemId',
            'الصنف', 'البضاعة', 'القطعة',
          ];
          const rawName = pickStr(productNameAliases);
          if (rawName && rawName.trim().toLowerCase() !== empName.trim().toLowerCase()) {
            prodName = rawName;
          }
        }
        if (!prodName) {
          const skuAlias = pickStr(['sku', 'SKU', 'code', 'كود', 'كود_المنتج']);
          if (skuAlias) prodName = skuAlias;
        }
        if (!qty || qty <= 0) {
          qty = pickNum(['quantity', 'qty', 'count', 'كمية', 'amount']) || 1;
        }
        out.employeeName = empName;
        out.productName = prodName;
        out.quantity = qty;
        if (rawItems.length > 0) {
          out.items = rawItems.map((it: any) => ({
            productNameOrSku: String(it.sku || it.SKU || it.productName || it.name || it.product || it['كود'] || it['اسم_المنتج'] || '').trim(),
            quantity: Number(it.quantity || it.qty || it.count || 1),
          })).filter((it: any) => it.productNameOrSku);
        }
        break;
      }
      case 'SETTLEMENT': {
        const partyFields = [
          'partyIdentifier', 'party', 'customer', 'customerName', 'supplier', 'name',
          'donor', 'beneficiary', 'partyId', 'emp', 'employee', 'employeeName',
          'الطرف', 'العميل', 'الداعم', 'المتبرع', 'receiver', 'fund', 'المستفيد',
          'provider', 'doctor', 'الفني', 'مقدم_الخدمة', 'المورد', 'vendor', 'creditor', 'debtor',
          'account', 'from', 'to', 'target', 'for', 'assignee', 'recipient', 'fundName',
          'صندوق', 'إلى', 'من', 'المستلم', 'الخزنة', 'الرصيد',
          'customerId', 'supplierId', 'donorId', 'beneficiaryId', 'empId', 'employeeId',
          'vendorId', 'doctorId', 'providerId',
        ];
        const party = pickStr(partyFields);
        out.partyIdentifier = party;
        const entryRaw = (pickStr(['entryType', 'entry_type', 'type', 'direction', 'نوع', 'movement', 'حركة']) || '').toUpperCase();
        let amt = pickNum(['amount', 'value', 'مبلغ', 'total', 'sum', 'قيمة']);
        amt = Math.abs(amt);
        let finalEntry = '';
        const allKeywords = [entryRaw, ...Object.values(raw).filter(v => typeof v === 'string').map(s => s)].join(' ');
        const creditRe = /CREDIT|تبرع|استلمنا|دفعة|سداد_لنا|إيراد|دين_لنا|تحت_الحساب|إيداع|رصيد_لنا|وارد|استلام|مقبوض|شيك_لنا|موجب|زائد|هبة|منح|أخذناه|وصلناه|إيصال_قبض|قبض|الى_الخزنة|زيادة|رصيد_صندوق|الى_صندوق|إضافة/i;
        const debitRe  = /DEBIT|خصم|مصروف|سداد_مورد|مديونية|باقي|حسم|دين_عليا|رسوم|تحت|تحويل_له|مدفوع|صادر|ناقص|خصم_له|منح_له|صرف|صرفنا|إيصال_صرف|دفع_له|تخصيص|مسحوب|تسوية_له|مستحقة_له|تسليم|فواتير|خارج|من_الخزنة|سحب|تسليم_له/i;
        if (entryRaw === 'CREDIT' || entryRaw === 'DEBIT') {
          finalEntry = entryRaw;
        } else if (creditRe.test(allKeywords) && !debitRe.test(allKeywords)) {
          finalEntry = 'CREDIT';
        } else if (debitRe.test(allKeywords) && !creditRe.test(allKeywords)) {
          finalEntry = 'DEBIT';
        } else if (creditRe.test(allKeywords) && debitRe.test(allKeywords)) {
          finalEntry = /تبرع|استلمنا|إيراد|وارد|قبض|هبة|منح|مقبوض|إلى_صندوق|رصيد_صندوق/i.test(allKeywords) ? 'CREDIT' : 'DEBIT';
        } else {
          finalEntry = amt > 0 ? 'CREDIT' : 'DEBIT';
        }
        if (amt <= 0) {
          const newAmt = Math.abs(Number(String(pickNum(['amount', 'value', 'مبلغ', 'total', 'sum', 'قيمة'])) || 0));
          if (newAmt > 0) amt = newAmt;
        }
        out.entryType = finalEntry;
        out.amount = amt;
        break;
      }
      case 'SERVICE_ORDER': {
        out.title = pickStr(['title', 'name', 'عنوان', 'serviceName', 'requestTitle', 'عنوان_الطلب']);
        out.category = pickStr(['category', 'تصنيف', 'type', 'النوع', 'الفئة', 'classification']) || 'عام';
        out.priority = pickStr(['priority', 'priorityLevel', 'الأولوية', 'اهمية', 'urgency']) || 'عادي';
        out.leadTechnician = pickStr(['leadTechnician', 'technician', 'lead', 'الفني_الرئيسي', 'serviceProvider', 'provider', 'مقدم_الخدمة', 'doctor', 'مقدم_الخدمة_اسم']);
        out.assistantTechnician = pickStr(['assistantTechnician', 'assistant', 'المساعد', 'admin', 'administrator', 'المسؤول', 'followUpAdmin', 'responsible', 'المسؤول_عن_المتابعة', 'admen']);
        break;
      }
      case 'EXPENSE': {
        const allKeywords = Object.entries(raw).map(([k, v]) => typeof v === 'string' ? `${k}:${v}` : '').join(' ');
        let cat = pickStr(['expenseCategory', 'category', 'تصنيف', 'type']) || '';
        if (!cat) {
          if (/غداء|فطور|عشاء|وجبة|اكل|أكل|طعام|مطعم|مطاعم/i.test(allKeywords)) cat = 'غذاء';
          else if (/بنزين|وقود|ديزل|كارت_بنزين|وقود|محطة|سيارة|عربية|نقل|مواصلات|تاكسي|أجرة/i.test(allKeywords)) cat = 'نقل';
          else if (/هالك|تالف|خردة|scrap|محروق|معطل|سحب_تالف|تالف/i.test(allKeywords)) cat = 'هالك/تالف';
          else if (/مصروف|أخرى|متفرقات|اخرى|آخرى|متنوع/i.test(allKeywords)) cat = 'أخرى';
          else cat = 'أخرى';
        }
        out.expenseCategory = cat;
        let amt = pickNum(['amount', 'value', 'مبلغ', 'total', 'sum', 'cost']);
        if (!amt || amt < 0) amt = 0;
        out.amount = amt;
        const party = pickStr(['partyIdentifier', 'party', 'name', 'supplier', 'vendor']);
        if (party) out.partyIdentifier = party;
        if (raw && raw['notes']) out.notes = raw['notes'];
        if (amt <= 0) out.__skip = true;
        break;
      }
      case 'RETURN_TO_INVENTORY': {
        const itemsRaw = raw && Array.isArray(raw['items']) ? raw['items'] : [];
        if (itemsRaw.length === 0) {
          const pn = pickStr(['productName', 'name', 'product', 'item', 'sku', 'SKU', 'code', 'كود', 'product_code', 'productId', 'itemId']);
          const q = pickNum(['quantity', 'current_stock', 'qty', 'count']) || 1;
          if (pn) {
            out.items = [{ productNameOrSku: pn, quantity: q }];
            out.name = pn; out.current_stock = q;
          }
        } else {
          out.items = itemsRaw.map((it: any) => ({
            productNameOrSku: it?.productNameOrSku || it?.productName || it?.name || it?.sku || it?.SKU || it?.code || it?.كود || it?.product_code || '',
            quantity: Number(it?.quantity || it?.qty || it?.count || 1),
          })).filter((it: any) => it.productNameOrSku);
        }
        break;
      }
      case 'EMPLOYEE_ATTENDANCE': {
        out.employeeName = pickStr(['employeeName', 'employee', 'emp', 'name', 'empName']);
        const st = (pickStr(['attendanceStatus', 'status', 'حالة', 'state']) || 'PRESENT').toUpperCase();
        out.attendanceStatus = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'].includes(st) ? st : 'PRESENT';
        out.date = pickStr(['date', 'تاريخ']) || new Date().toISOString().slice(0, 10);
        break;
      }
      case 'EMPLOYEE_ADVANCE': {
        out.employeeName = pickStr(['employeeName', 'employee', 'emp', 'name', 'empName']);
        const tt = (pickStr(['transactionType', 'type', 'نوع_الحركة']) || 'ADVANCE').toUpperCase();
        out.transactionType = ['ADVANCE', 'DEDUCTION', 'BONUS', 'PAYROLL_PAYMENT'].includes(tt) ? tt : 'ADVANCE';
        out.amount = pickNum(['amount', 'value', 'مبلغ']) || 0;
        break;
      }
      case 'SALE':
      case 'ORDER': {
        const itemsRaw = raw && Array.isArray(raw['items']) ? raw['items'] : [];
        out.items = itemsRaw.map((it: any) => ({
          productNameOrSku: it?.productNameOrSku || it?.productName || it?.name || it?.sku || '',
          quantity: Number(it?.quantity || it?.qty || 1),
        }));
        out.partyIdentifier = pickStr(['partyIdentifier', 'party', 'customer', 'customerName', 'name']);
        break;
      }
    }
    return out;
  }

  private normalizeSchemaAndOrder(parsed: any): {
    intent: string;
    extractedData: Record<string, unknown>;
    reply: string;
    requiresConfirmation: boolean;
  } {
    const intent = (parsed?.intent || 'UNKNOWN') as string;
    const order = OpenAIProvider.ACTION_ORDER;
    let extractedData: Record<string, unknown> = { ...(parsed?.extractedData || {}) };
    let reply = parsed?.reply || 'تم استلام رسالتك.';
    const requiresConfirmation = parsed?.requiresConfirmation ?? (intent !== 'UNKNOWN');

    if (intent === 'MULTI_ACTION' && Array.isArray(extractedData['actions'])) {
      const rawActions = extractedData['actions'] as Array<{ intent: string; description: string; extractedData: Record<string, unknown> }>;
      const normalizedActions = rawActions.map((a) => ({
        intent: a.intent || 'UNKNOWN',
        description: a.description || a.intent || '',
        extractedData: this.normalizeExtractedDataForIntent(a.intent || 'UNKNOWN', a.extractedData || {}),
      })).filter((a) => a && !(a.extractedData && (a.extractedData as any)['__skip'] === true));
      normalizedActions.sort((a, b) => {
        const ia = order.indexOf(a.intent);
        const ib = order.indexOf(b.intent);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
      const numList = normalizedActions
        .map((a, i) => {
          const extras: string[] = [];
          if ((a.intent === 'SETTLEMENT' || a.intent === 'EXPENSE' || a.intent === 'EMPLOYEE_ADVANCE')) {
            const amt = Number(a.extractedData['amount'] || 0);
            if (amt > 0) extras.push(`${amt} ج.م`);
            const et = a.extractedData['entryType'];
            if (et) extras.push(String(et));
            const p = a.extractedData['partyIdentifier'] || a.extractedData['employeeName'];
            if (p) extras.push(`لـ ${p}`);
          }
          if (a.intent === 'ADD_INVENTORY') {
            const qty = Number(a.extractedData['current_stock'] || 0);
            if (qty > 0) extras.push(`كمية ${qty}`);
            const cost = Number(a.extractedData['cost_price'] || 0);
            if (cost > 0) extras.push(`تكلفة ${cost} ج.م`);
          }
          const extra = extras.length ? ` (${extras.join(' • ')})` : '';
          return `${i + 1}. ${a.description || a.intent}${extra}`;
        })
        .join('\n');
      extractedData = { ...extractedData, actions: normalizedActions };
      reply = `فهمت الرسالة واستخرجت منها ${normalizedActions.length} أوامر:\n${numList}\n\nيرجى تأكيد التنفيذ.\n\nيتطلب تأكيدك لتنفيذ العملية في النظام:`;
    } else if (intent !== 'MULTI_ACTION' && intent !== 'UNKNOWN') {
      extractedData = this.normalizeExtractedDataForIntent(intent, extractedData);
    }
    return { intent, extractedData, reply, requiresConfirmation };
  }
}
