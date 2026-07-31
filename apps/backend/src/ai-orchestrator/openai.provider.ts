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

Return ONLY a JSON object with the following schema:
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
- ADD_INVENTORY: إضافة منتج للمخزون (مثل: ضف للمخزون 300 كيلو صدور دجاج بسعر 220 / طقم مفكات ألماني بسعر 350 الكود بتاعه Tool-01 / 20 متر كابل كهرباء سعر المتر 45)
- SALE: تسجيل عملية بيع لعميل (مثل: سجل أوردر بيع 15 كيلو صدور دجاج للعميل محمود)
- ORDER: طلب شراء أو أوردر منتجات
- SETTLEMENT: تسجيل مديونية أو دفعة أو تسوية مالية (مثل: سجل مديونية تسوية على محمود بمبلغ 750 / استلمنا 1500 من شركة الأمل تحت الحساب = سداد CREDIT)
- EXPENSE: مصروف أو فاتورة أو دفع لمورد أو تحويل (مثل: دفع فاتورة كهرباء 1500) — ملاحظة: المنتجات للمخزون أو العهدة أو السلفة ليست مصروفات اطلاقاً
- RETURN_TO_INVENTORY: إرجاع منتج للمخزون (مثل: رجّع للمخزن 5 كيلو صدور دجاج)
- ADD_EMPLOYEE: إضافة موظف جديد بالاسم والوظيفة والراتب مع تفعيل الحضور التلقائي (صيغ: "عامل جديد اسمه (علي حسن) ووظيفته فني صيانة" - "موظف تاني اسمه سعيد عبد الله مساعد")
- EMPLOYEE_ATTENDANCE: تسجيل حضور أو غياب أو تأخير موظف (مثل: علي حسن حضر / سعيد عبد الله غاب / محمد مصطفى حضر متأخر نص ساعة)
- EMPLOYEE_ADVANCE: سلفة أو خصم أو مكافأة لموظف (مثل: علي حسن أخد سلفة 200 من الخزنة)
- INVENTORY_WITHDRAWAL: عهدة أو مسحوبات موظف من المخزون (مثل: علي حسن أخد طقم المفكات الألماني / محمد مصطفى أخد 5 متر كابل كهرباء)
- ADD_CUSTOMER: إضافة عميل جديد
- MULTI_ACTION: عندما يحتوي الطلب على أكثر من أمر واحد
- UNKNOWN: رسالة عامة أو استفسار

=== قواعد مهمة جداً (لازم تطبقها):
1. رد دايماً بالعربي وبأسلوب ودي ومهني
2. لو طلب المستخدم يحتوي على أوامر متعددة استخرجها كـ MULTI_ACTION مع أوبجكت actions كامل
3. **فرز أوامر إجباري (الترتيب ده مهم جداً عشان ما نعملش أخطاء أجنبية):**
   المرحلة 1 → ADD_EMPLOYEE (إضافة الموظفين الجدد)
   المرحلة 2 → ADD_CUSTOMER (إضافة العملاء الجدد)
   المرحلة 3 → ADD_INVENTORY (إضافة المنتجات للمخزون)
   المرحلة 4 → EMPLOYEE_ATTENDANCE (تسجيل الحضور والغياب والتأخير)
   المرحلة 5 → INVENTORY_WITHDRAWAL (عهدة ومسحوبات المخزون للموظفين)
   المرحلة 6 → SALE / ORDER (مبيعات وأوردرات)
   المرحلة 7 → EMPLOYEE_ADVANCE (سلف ومكافآت الموظفين)
   المرحلة 8 → SETTLEMENT / EXPENSE (تسويات ومصروفات)
   المرحلة 9 → RETURN_TO_INVENTORY (إرجاع للمخزن)
4. لو ذكر اسم موظف في الحضور/العهدة/السلفة ومش موجود في قائمة ADD_EMPLOYED → أضف ADD_EMPLOYED له أولًا بالاسم ووضائف "عامل" افتراضياً
5. لو ذكر اسم عميل في التسوية ولم يكن موجود → أضف ADD_CUSTOMER أولًا
6. **الفرق الهام جدًا:**
   - طقم مفكات ألماني بسعر 350 جنيه (يضاف للمخزون أولاً) = ADD_INVENTORY 🔴 لا تسجله كمصروف إطلاقاً
   - علي حسن أخد طقم المفكات = INVENTORY_WITHDRAWAL (ليس EXPENSE وليس EMPLOYEE_ADVANCE)
   - علي حسن أخد سلفة 200 جنيه من الخزنة = EMPLOYEE_ADVANCE (ليس EXPENSE)
   - استلمنا 1500 من شركة الأمل تحت الحساب = SETTLEMENT CREDIT لـ "شركة الأمل" (لا تقطع الاسم لسلسلة أقصر مثل "الع" — اكتب الاسم كامل!)
   - فاتورة كهرباء 350 = EXPENSE فقط لو كانت فاتورة فعلية (بس طقم مفكات للمخزون مش مصروف)
7. سجل الحضور المتأخر كـ attendanceStatus = "HALF_DAY"
8. لأي MULTI_ACTION اكتب الرد بترتيب الأوامر المرقم في الـ description لكل action في الـ actions

أرجع JSON حرفياً بالـ schema ده:
{
  "intent": "ADD_INVENTORY|SALE|ORDER|SETTLEMENT|EXPENSE|RETURN_TO_INVENTORY|ADD_EMPLOYEE|EMPLOYEE_ATTENDANCE|EMPLOYEE_ADVANCE|INVENTORY_WITHDRAWAL|ADD_CUSTOMER|MULTI_ACTION|UNKNOWN",
  "reply": "الرد بالعربي — وفي حالة MULTI_ACTION يكون فيه قائمة مرقمة بالأوامر المُستخرجة + طلب تأكيد",
  "requiresConfirmation": true,
  "extractedData": {
    "items": [{"productNameOrSku": "string", "quantity": 1}],
    "name": "اسم المنتج", "sku": "SKU-CODE", "current_stock": 0, "unit_price": 0, "cost_price": 0,
    "partyIdentifier": "اسم الطرف كامل ولا تقطعه!", "entryType": "CREDIT|DEBIT", "amount": 0,
    "employeeName": "اسم الموظف كامل", "jobTitle": "الوظيفة", "baseRate": 0, "salaryType": "DAILY|MONTHLY",
    "autoAttendance": true, "transactionType": "ADVANCE|DEDUCTION|BONUS|PAYROLL_PAYMENT",
    "expenseCategory": "كهرباء|مياه|موبايل|إيجار|موردين|نقل|أخرى",
    "date": "YYYY-MM-DD", "attendanceStatus": "PRESENT|ABSENT|HALF_DAY|LEAVE",
    "productName": "اسم المنتج المسحوب للموظف", "quantity": 0,
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
      return {
        intent: parsed.intent || 'UNKNOWN',
        extractedData: parsed.extractedData || {},
        reply: parsed.reply || 'تم استلام رسالتك.',
        requiresConfirmation: parsed.requiresConfirmation ?? false,
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
}
