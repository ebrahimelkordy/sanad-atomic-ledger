import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/.env' });

import OpenAI from 'openai';
import { preprocessUserMessage } from './src/ai-orchestrator/preprocess-deterministic';

const USER_MESSAGE = `بص يا ريس، ركز معايا عشان الأوردر ده تقيل وتفاصيله كتير ومش عايز فيه أي غلطة.
عندنا عميل جديد لسه أول مرة يشتغل معانا، اسمه 'المهندس طارق الدسوقي' تبع 'شركة القمة للمقاولات'، رقم تليفونه 01011223344، وعنوانه في '50 شارع التسعين - التجمع الخامس'.
الطلب ده استلمه الموظف 'خالد' عندنا في الإدارة، وفتح بيه أوردر باسم 'تأسيس شبكة حريق وتكييف مركزي'، وخلى حالة الأوردر 'جاري التجهيز' لأن الأولوية بتاعته 'عالية'.
خالد عين الفني 'محمود السيد' عشان يكون هو المسؤول عن التركيبات وينزل الموقع.

دلوقتي محمود محتاج يسحب عهدة تقيلة من المخزن عشان ينزل يشتغل، ركز في الكميات والأسعار، ولو في أي صنف من دول مش متكود عندك على السيستم، أنشئه وكوده فوراً بالبيانات دي بالظبط:

صنف 'مواسير حريق سيملس 4 بوصة': الكمية 50 متر، وسعر المتر 1200 جنيه.

صنف 'كابينة حريق كاملة بالخرطوم': الكمية 4 كبائن، وسعر الكابينة 4500 جنيه.

صنف 'محبس فراشة 4 بوصة': الكمية 12 محبس، وسعر المحبس 850 جنيه.

صنف 'لفة سلك نحاس 16 مللي سويدي': الكمية 3 لفات، وسعر اللفة 6000 جنيه.

كل الأصناف دي تتسحب وتتسجل عهدة صريحة باسم الفني 'محمود السيد' شخصياً عشان نقدر نحاسبه عليها.

وبالنسبة للفلوس، شركة القمة دفعت للموظف 'خالد' مبلغ 45000 جنيه (خمسة وأربعين ألف جنيه) عن طريق 'شيك بنكي' كدفعة مقدمة تحت الحساب للأوردر ده.
ظبطلي الداتا دي كلها، وسجل العميل والموظفين والأوردر، وسمّع المخزون والفلوس في السيستم صح من غير ما تضرب أي أصفار.`;

const SYSTEM_PROMPT = `أنت مساعد ذكي لنظام إدارة أعمال ومقاولات ومخازن اسمه "سند".
قم بتحليل رسالة المستخدم واستخراج جميع الأوامر والبيانات بدقة شديدة وإرجاعها بتنسيق JSON.

=== التصنيفات المتاحة (Intents):
- ADD_CUSTOMER: إضافة عميل أو شركة جديدة (الاسم، الشركة، رقم الهاتف، العنوان)
- ADD_EMPLOYEE: إضافة أو تسجيل موظف/فني جديد
- ADD_INVENTORY: إضافة أصناف جديدة للمخزون أو تكويدها (اسم الصنف، الكمية، السعر، وحدة القياس)
- SERVICE_ORDER: فتح طلب خدمة/أوردر عمل جديد (اسم الأوردر، العميل، الموظف المسؤول، الفني، الحالة، الأولوية)
- INVENTORY_WITHDRAWAL: سحب عهدة/أصناف من المخزن لصالح فني أو أوردر (اسم الموظف/الفني، الأصناف والكميات)
- SETTLEMENT: دفعة مالية/تحصيل/دفعة مقدمة (اسم العميل/الجهة، المبلغ، طريقة الدفع، الموظف المستلم، نوع الحركة)
- MULTI_ACTION: عند وجود أكثر من أمر مختلف في الرسالة

=== القواعد الإلزامية:
1. رد بتنسيق JSON حصرياً.
2. استخرج كل فعل أو طلب صريح أو ضمني كـ action منفصل داخل قائمة "actions".
3. احتفظ بالأسماء والتفاصيل كما جاءت بالظبط بدون حذف.

صيغة output المطلوبة:
{
  "intent": "MULTI_ACTION",
  "reply": "ملخص باللغة العربية لما تم استخراجه مع قائمة مرقمة بالأوامر",
  "requiresConfirmation": true,
  "extractedData": {
    "actions": [
      {
        "intent": "اسم الـ intent لكل امر",
        "description": "وصف واضح للأمر بالعربي",
        "extractedData": { ... تفاصيل البيانات المتعلقة بالأمر ... }
      }
    ]
  }
}`;

async function runTest() {
  console.log('=====================================================');
  console.log('🚀 تشغيل الموديل لإنشاء وتحليل استجابة الداتا المعقدة');
  console.log('=====================================================\n');

  console.log('1️⃣ مرحلة المعالجة الأولية (Deterministic Preprocessor):');
  const preprocessed = preprocessUserMessage(USER_MESSAGE);
  console.log('   - Vertical:', preprocessed.vertical);
  console.log('   - Inventory Facts Detected:', preprocessed.inventoryFacts.length);
  console.log('   - Party Facts Detected:', preprocessed.partyFacts.length);

  const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY || '',
    baseURL: 'https://api.groq.com/openai/v1',
  });

  console.log('\n2️⃣ إرسال الطلب للموديل (Llama 3.3 70B / Groq)...');
  const startTime = Date.now();
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: USER_MESSAGE },
    ],
    response_format: { type: 'json_object' },
  });
  const duration = Date.now() - startTime;

  console.log(`✅ تم استلام الاستجابة خلال ${duration}ms\n`);

  const rawContent = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(rawContent);

  console.log('=====================================================');
  console.log('📊 نتائج الاستخراج والتصنيف من الموديل');
  console.log('=====================================================');
  console.log(`إجمالي الأوامر المستخرجة: ${parsed.extractedData?.actions?.length || 0}\n`);

  parsed.extractedData?.actions?.forEach((act: any, idx: number) => {
    console.log(`[أمر ${idx + 1}] -> Intent: ${act.intent}`);
    console.log(`   الوصف: ${act.description}`);
    console.log(`   البيانات:`, JSON.stringify(act.extractedData, null, 2));
    console.log('-----------------------------------------------------');
  });

  console.log('\n💬 رد الموديل للمستخدم:');
  console.log(parsed.reply);
}

runTest().catch((err) => {
  console.error('❌ حدث خطأ أثناء تشغيل الاختبار:', err);
});
