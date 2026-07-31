import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/.env' });

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

const TEST_MESSAGE = `يا مساعد، السيستم عندنا لسه أبيض ومفيش أي بيانات قديمة خالص. ابدأ معايا من الصفر وسجل الداتا دي بالترتيب واربطها ببعض:  أولاً: تسجيل الحسابات الجديدة:  سجل داعم (متبرع) جديد باسم 'مؤسسة الأمل الخيرية'، رقم التواصل 01000001111.  سجل مقدم خدمة جديد باسم 'دكتور عادل إمام'، تخصصه 'عيون'، ومكانه في 'الدقي'.  سجل مستفيد جديد باسم 'ياسين محمود'، طفل عمره 10 سنين، تصنيفه 'حالة مرضية حرجة'.  سجل موظف/أدمن جديد في فريقنا اسمه 'عمر طارق' واديله صلاحية 'متابعة الطلبات'.  ثانياً: تأسيس المخزن: دخل عندنا منتج جديد لأول مرة: 'نظارة طبية أطفال'، الكمية المتاحة 10 قطع، تكلفة القطعة علينا 400 جنيه.  ثالثاً: فتح الطلبات والربط: افتح طلب 'سند' جديد للمستفيد 'ياسين محمود'، عنوان الطلب 'كشف نظر وعمل نظارة طبية'، التصنيف 'طبي'. اربط الطلب ده بمقدم الخدمة 'دكتور عادل إمام'، وخلي الأدمن 'عمر طارق' هو المسؤول عن متابعة الطلب. واصرف من المخزن 'نظارة طبية أطفال' واحدة للطلب ده.  رابعاً: الحركات المالية: 'مؤسسة الأمل الخيرية' بعتت تبرع جديد بقيمة 10,000 جنيه كاش. خصص من التبرع ده: 400 جنيه لتغطية تكلفة النظارة، و 600 جنيه رسوم كشف تتحول في رصيد 'دكتور عادل إمام'. وباقي مبلغ التبرع (9000 جنيه) ضيفه في حاجة اسمها 'صندوق الحالات الطبية'."`;

const GEMINI_SYSTEM_PROMPT = `أنت مساعد ذكي لنظام إدارة أعمال اسمه "سند".
نوع نشاط التاجر: جمعية خيرية / مؤسسة خيرية.

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
- ADD_CUSTOMER: إضافة عميل / مورد / داعم / مستفيد / مقدم خدمة جديد
- SERVICE_ORDER: افتح طلب خدمة / صيانة / سند جديد (اسم، تصنيف، أولوية، فني رئيسي، مساعد).
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

الرسالة: "${TEST_MESSAGE}"`;

const GROQ_SYSTEM_PROMPT = GEMINI_SYSTEM_PROMPT + `

أرجع JSON حرفياً بالـ schema ده:
{
  "intent": "ADD_INVENTORY|SALE|ORDER|SETTLEMENT|EXPENSE|RETURN_TO_INVENTORY|ADD_EMPLOYEE|EMPLOYEE_ATTENDANCE|EMPLOYEE_ADVANCE|INVENTORY_WITHDRAWAL|ADD_CUSTOMER|SERVICE_ORDER|MULTI_ACTION|UNKNOWN",
  "reply": "الرد بالعربي — وفي حالة MULTI_ACTION يكون فيه قائمة مرقمة بالأوامر المُستخرجة + طلب تأكيد",
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
}`;

async function testGemini() {
  console.log('\n========== TEST GEMINI (DIRECT CALL - NO FALLBACK) ==========');
  console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'SET (length=' + process.env.GEMINI_API_KEY.length + ')' : 'NOT SET');
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const startTime = Date.now();
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: GEMINI_SYSTEM_PROMPT }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    const elapsed = Date.now() - startTime;
    const rawText = result.response.text();
    console.log(`\n✅ Gemini succeeded in ${elapsed}ms`);
    console.log('\n--- RAW RESPONSE TEXT (first 3000 chars) ---');
    console.log(rawText.substring(0, 3000));
    console.log('\n--- PARSED JSON ---');
    try {
      const parsed = JSON.parse(rawText);
      console.log('intent:', parsed.intent);
      console.log('requiresConfirmation:', parsed.requiresConfirmation);
      console.log('reply:', (parsed.reply || '').substring(0, 500));
      if (parsed.extractedData?.actions && Array.isArray(parsed.extractedData.actions)) {
        console.log('Number of actions extracted:', parsed.extractedData.actions.length);
        for (let i = 0; i < parsed.extractedData.actions.length; i++) {
          const a = parsed.extractedData.actions[i];
          console.log(`  ${i + 1}. [${a.intent}] ${a.description?.substring(0, 150) || '(no description)'}`);
        }
      } else {
        console.log('extractedData keys:', Object.keys(parsed.extractedData || {}));
        console.log('extractedData content:', JSON.stringify(parsed.extractedData || {}, null, 2).substring(0, 1000));
      }
    } catch (parseErr) {
      console.log('❌ JSON PARSE ERROR:', (parseErr as Error).message);
    }
  } catch (err) {
    console.log('❌ Gemini FAILED:', (err as Error).message);
    console.log('Stack:', (err as Error).stack);
  }
}

async function testGroq() {
  console.log('\n\n========== TEST GROQ (DIRECT CALL - NO FALLBACK) ==========');
  console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? 'SET (length=' + process.env.GROQ_API_KEY.length + ')' : 'NOT SET');
  try {
    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY || '',
      baseURL: 'https://api.groq.com/openai/v1',
    });
    const startTime = Date.now();
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: GROQ_SYSTEM_PROMPT },
        { role: 'user', content: TEST_MESSAGE },
      ],
      response_format: { type: 'json_object' },
    });
    const elapsed = Date.now() - startTime;
    const rawText = response.choices[0].message.content || '{}';
    console.log(`\n✅ Groq succeeded in ${elapsed}ms`);
    console.log('\n--- RAW RESPONSE TEXT (first 3000 chars) ---');
    console.log(rawText.substring(0, 3000));
    console.log('\n--- PARSED JSON ---');
    try {
      const parsed = JSON.parse(rawText);
      console.log('intent:', parsed.intent);
      console.log('requiresConfirmation:', parsed.requiresConfirmation);
      console.log('reply:', (parsed.reply || '').substring(0, 500));
      if (parsed.extractedData?.actions && Array.isArray(parsed.extractedData.actions)) {
        console.log('Number of actions extracted:', parsed.extractedData.actions.length);
        for (let i = 0; i < parsed.extractedData.actions.length; i++) {
          const a = parsed.extractedData.actions[i];
          console.log(`  ${i + 1}. [${a.intent}] ${a.description?.substring(0, 150) || '(no description)'}`);
        }
      } else {
        console.log('extractedData keys:', Object.keys(parsed.extractedData || {}));
        console.log('extractedData content:', JSON.stringify(parsed.extractedData || {}, null, 2).substring(0, 1000));
      }
    } catch (parseErr) {
      console.log('❌ JSON PARSE ERROR:', (parseErr as Error).message);
    }
  } catch (err) {
    console.log('❌ Groq FAILED:', (err as Error).message);
    console.log('Stack:', (err as Error).stack);
  }
}

async function main() {
  console.log('TEST MESSAGE PREVIEW:', TEST_MESSAGE.substring(0, 200) + '...');
  await testGemini();
  await testGroq();
  console.log('\n\n========== END OF TESTS ==========');
}

main().catch((e) => console.error('FATAL:', e));
