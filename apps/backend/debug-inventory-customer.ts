import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/.env' });

import OpenAI from 'openai';
import {
  preprocessUserMessage,
  type VerticalHint,
} from './src/ai-orchestrator/preprocess-deterministic';

const VERTICAL_RULES: Record<VerticalHint, string> = {
  AUTO_WORKSHOP: 'أوردر قطع غيار/صيانة سيارات → SERVICE_ORDER. تسليم قطع للفني = INVENTORY_WITHDRAWAL.',
  PHARMACY: 'صرف روشتة/أدوية لعميل = INVENTORY_WITHDRAWAL (ليس SALE!).',
  RESTAURANT: 'توصيل أكل = SALE. تسليم مكونات لطباخ = INVENTORY_WITHDRAWAL.',
  CONSTRUCTION: 'تسليم مواد بناء لموقع = INVENTORY_WITHDRAWAL. مقاول/شركة إنشاءات = ADD_CUSTOMER.',
  ELECTRONICS: 'اصلاح هاتف = SERVICE_ORDER. فني يأخذ قطع غيار = INVENTORY_WITHDRAWAL.',
  CHARITY: 'تبرعات = SETTLEMENT CREDIT للداعم + ADD_CUSTOMER للداعم أولًا.',
  GENERAL_TRADE: '',
};

const scenarios = [
  {
    id: 'AUTO_MECHANIC',
    name: 'ورشة ميكانيكا',
    vertical: 'ورشة ميكانيكا سيارات',
    message: `أضيف عامل جديد اسمه "حسام ورشة" ووظيفته فني كبرى وراتبه 8000 وتليفونه 01234567801.
  أحمد فني (الراتب 7000) حضر اليوم واخد 3 ساعات أفرتايم.
  دخل مخزون: 8 كراتين فلاتر هوندا الكرتونة فيها 12 قطعة وسعر شراء الكرتونة 1440 جنيه وسعر بيع القطعة 150، و 4 إطارات بريجستون فريزا 195/65 سعر القطعة 2300، و 12 بوشة دينامو سعر الواحدة 85 كود BSH-009.
  حسام ورشة أخذ 4 فلاتر هوندا و 2 إطار بريجستون عهدة لورشه رقم 2.
  ورشه رقم 2: حسام ورشة رجع فلتر واحد مستعمل غير مناسب وسحب بداله واحد جديدة والفلتر القديم سجلته في الهالك.
  فتح أوردر صيانة لسيارة ملك "أستاذ سامح" (العميل) نوع هوندا سيفك 2022، الفني الرئيسي أحمد فني، تصنيف "صيانة كبرى"، أولوية عاجلة.
  استلمنا من أستاذ سامح 3000 جنيه تحت الحساب. خصمنا 200 خصم، والباقي على حسابه.`,
  },
  {
    id: 'PHARMACY',
    name: 'صيدلية',
    vertical: 'صيدلية',
    message: `صيدلي جديد: "فاطمة نور" وظيفة صيدلي رئيسي وراتب 6000 وتليفون 01234567811.
  فاطمة نور حضرت اليوم.
  دخل مخزون: 10 كراتين بنادول اكسترا كل كرتونة 100 شريط سعر الكرتونة 900 وسعر الشريط القطاعي 10، و5 كراتين جلوكوفاج 850 ملي الكرتونة 30 شريط سعر الكرتونة 360 وسعر الشريط 13، و 3 كراتين سيفترياكس 1 جرام الكرتونة فيها 1 فايال سعر الفايال 55 كود CEF-1G.
  صرف لعميلة "آمنة أحمد" روشتة: بنادول اكسترا 2 شريط و جلوكوفاج 850 1 شريط.
  أضيف مورد "شركة الفا للأدوية" كمورد.
  طلب شركة المستشفى التخصصي جملة: سيفترياكس 50 فايال + بنادول 20 شريط — سعر المورد + 10% ربح.
  استلمنا دفعة من شركة المستشفى قيمة 4000 من فاتورة الجملة، والباقي مؤجل، + خصم 150 للربا الداخلي.
  فاطمة نور اخدت سلفة 1000 جنيه من الخزنة.
  هالك: 2 فايال سيفترياكس كسرت أثناء التوصيل — سجلها مصروف هالك.`,
  },
  {
    id: 'CONSTRUCTION',
    name: 'شركة مواد بناء',
    vertical: 'شركة مواد بناء',
    message: `عامل بناء جديد: "أحمد رماني" وراتبه 4500 وتليفون 01234567831.
  "أحمد رماني" و "محمد الكساري" (راتبه 4200، وظيفة عامل تشييد) و "حسن السقا" (راتبه 5000 وظيفة منسق موقع): الثلاثة حضروا اليوم وكل واحد أخد 50 جنيه مصاريف نقل.
  دخل المخزون: 3 كراتين أسمنت اسمنت مصر كل كرتونة 50 كيلو سعر الكرتونة 280 كود CEM-01. و 5 كراتين حديد 12 مم الكرتونة فيها 12 قضيب سعر الكرتونة 900 كود IR-12. و 10 طن رمل كل طن 180 كود SAND-01. و 2 كرتونة طوب احمر الكرتونة 250 قطعة سعر الكرتونة 750 كود BRK-RD.
  سلم المقاول "شركة المنار للإنشاءات" لموقع 101: أسمنت 100 كيلو + حديد 12 مم 6 قضيب + رمل 5 طن + طوب احمر 500 قطعة.
  موقع 101 رجع 10 كيلو أسمنت زيادة.
  فاتورة كهرباء المقر 3200 جنيه.
  "أحمد رماني" اخد سلفة 500 جنيه.
  استلمنا من شركة المنار للإنشاءات 25000 دفعة من فاتورة الموقع (CREDIT)، والباقي 18000 مؤجل (DEBIT) وخصمنا 500 خصم نقدي (DEBIT).`,
  },
  {
    id: 'ELECTRONICS_REPAIR',
    name: 'إلكترونيات',
    vertical: 'محل إلكترونيات + مركز صيانة',
    message: `أضيف فنيين جدد: "كريم موبايل" (راتبه 5500 وات 01234567841) وظيفة فني صيانة شاشات، و "بسام الكهربائي" (راتبه 5000 وات 01234567842) وظيفة فني صيانة أجهزة.
  كريم موبايل و بسام الكهربائي حضروا اليوم وكل واحد فيهم اخد 3 ساعات أفرتايم.
  دخل مخزون: 5 كراتين بطاريات دوجي كل كرتونة 10 قطع سعر الكرتونة 750 وسعر القطعة 85 كود BAT-DOOG. و 4 كراتين شاشات شاومي ريدمي نوت 10 الكرتونة 5 قطع سعر الكرتونة 12500 وسعر القطعة 2700 كود SCR-RN10. و 3 كراتين كروت ذاكرة 64 جيجا الكرتونة 25 قطعة سعر الكرتونة 1250 وسعر القطعة 55 كود MEM-64GB. و 2 كراتين سماعات بلوتوث الكرتونة 15 قطعة سعر الكرتونة 1800 وسعر القطعة 135 كود BT-AUD.
  أضيف عميل "محمد الشريف" (رقمه 01090123111) وعميل "شركة إتيسالات للتجارة".
  فتح طلب خدمة: عميل محمد الشريف جاب تليفون شاومي نوت 10 مكسور الشاشة، الفني الرئيسي كريم موبايل، المساعد بسام الكهربائي، التصنيف "صيانة شاشة"، الأولوية عاجلة.
  كريم موبايل اخد عهدة: شاشة شاومي نوت 10 × 1 قطعة + كرت ذاكرة 64 جيجا × 1.
  فتح طلب خدمة ثاني: شركة إتيسالات للتجارة — 3 سماعات بلوتوث معطلة للصيانة، الفني الرئيسي بسام الكهربائي.
  بسام الكهربائي اخد سماعات بلوتوث × 3 عهدة للصيانة، أصلح 2 و سماعة واحدة تالفة رجعها المخزن وهالك.
  بيع لعميل سيد أحمد: بطارية دوجي × 2 قطعة + سماعة بلوتوث × 1.
  بسام الكهربائي اخد سلفة 700 جنيه.
  استلمنا من محمد الشريف 3200 دفعة من فاتورة الصيانة (CREDIT) والباقي 800 مؤجل (DEBIT) + خصم 200 للربا الداخلي (DEBIT).`,
  },
];

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || '',
  baseURL: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
});

async function main() {
  console.log('\n\n========= 🔍 DIAGNOSTIC: Inventory & Customers =========\n');
  for (const s of scenarios.slice(0, 2)) {
    const pre = preprocessUserMessage(s.message);
    console.log(`\n--- Scenario: ${s.id} ---`);
    console.log('[Preprocessor] vertical:', pre.vertical);
    console.log('[Preprocessor] inventoryFacts:', JSON.stringify(pre.inventoryFacts, null, 2));
    console.log('[Preprocessor] partyFacts:', JSON.stringify(pre.partyFacts, null, 2));
    console.log('[Preprocessor] summary:');
    pre.summaryBulletPoints.forEach((b, i) => console.log(`  [${i + 1}]`, b));

    const prompt = `أنت مساعد ذكي لنظام "سند" — نوع النشاط: ${s.vertical}.
الرد دائماً JSON وبالعربي.

=== التصنيفات:
ADD_INVENTORY | SALE | ORDER | SETTLEMENT | EXPENSE | RETURN_TO_INVENTORY
ADD_EMPLOYEE (موظف/عامل/فني) | ADD_CUSTOMER (عميل/مورد/داعم/شركة/مؤسسة)
EMPLOYEE_ATTENDANCE | EMPLOYEE_ADVANCE | INVENTORY_WITHDRAWAL (items[] لأكثر من صنف!)
SERVICE_ORDER | MULTI_ACTION (>1 أمر) | UNKNOWN

=== 10 قواعد إلزامية:
1. MULTI_ACTION فرز: ADD_EMPLOYEE → ADD_CUSTOMER → ADD_INVENTORY → EMPLOYEE_ATTENDANCE → INVENTORY_WITHDRAWAL → SALE → EMPLOYEE_ADVANCE → SETTLEMENT → EXPENSE → RETURN_TO_INVENTORY → SERVICE_ORDER
2. ⛔ شركة/مستشفى/فندق/مقاول/مؤسسة = ADD_CUSTOMER دائماً (لا ADD_EMPLOYEE أبداً حتى لو جاء "شركة كذا أخذ حاجة")
3. ⛔ كل اسم طرف في SETTLEMENT/ORDER/SALE يسبقه ADD_CUSTOMER أولًا — حتى لو لم يصرح المستخدم بإضافته.
4. موظف/عميل مذكور وغير مضاف → أضفه تلقائيًا أولاً.
5. "أخذ X+Y ورجع X وسحب بداله وتالف" → (1) INVENTORY_WITHDRAWAL X+Y (2) RETURN X (3) بديل INVENTORY_WITHDRAWAL X (4) EXPENSE هالك X.
6. دفعة + خصم + باقي مؤجل = 3 SETTLEMENTs.
7. أسماء كاملة: "شركة التقنية" / "أستاذ سامح" ولا تقطع.
8. هاتف: 01xxxxxxxxxx ضيفه في phone (لا كمبلغ!).
9. ⛔ كميات/أسعار المخزون: استخدم PREPROCESSED FACTS فقط حصرًا ولا تخمن!
10. مسحوبات لأكثر من صنف لشخص واحد = INVENTORY_WITHDRAWAL واحد + items[] (لا تفصلهم!). مثال: "أخذ فلتر×4+إطار×1" → items: [{FLT qty4}, {TIR qty1}].

${VERTICAL_RULES[pre.vertical] || ''}

=== 🚨 PREPROCESSED FACTS (100% صحيحة — استخدمها حصرًا ولا تخمن!):
${pre.summaryBulletPoints.join('\n')}

الرسالة: "${s.message}"

أرجع JSON حرفياً:
{
  "intent": "MULTI_ACTION أو ...",
  "reply": "الرد بالعربي + قائمة الأوامر + طلب تأكيد",
  "requiresConfirmation": true,
  "extractedData": {
    "actions": [
      {
        "intent": "...",
        "description": "وصف الأمر بالعربي",
        "extractedData": { ... حقول هذا النوع ... }
      }
    ]
  }
}`;

    const t0 = Date.now();
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: s.message },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 3500,
    });
    const ms = Date.now() - t0;
    const parsed = JSON.parse(res.choices[0].message.content || '{}');
    const actions = parsed?.extractedData?.actions || [];
    console.log(`\n[LLM ${ms}ms] actions count = ${actions.length}`);
    actions.forEach((a: any, i: number) => {
      const d = a.extractedData || {};
      if (a.intent === 'ADD_INVENTORY') {
        console.log(`  [${i}] ADD_INVENTORY -> name=${d.name || d.productName} qty=${d.quantity ?? d.current_stock} cost=${d.cost_price} unit=${d.unit_price} sku=${d.sku}`);
      } else if (a.intent === 'ADD_CUSTOMER') {
        console.log(`  [${i}] ADD_CUSTOMER -> name=${d.name} phone=${d.phone} type=${d.customer_type}`);
      } else if (a.intent === 'INVENTORY_WITHDRAWAL') {
        const items = d.items?.length ? d.items.map((x: any) => `${x.product_ref || x.name}*${x.qty || x.quantity}`).join('+') : `item=${d.product_ref || d.product_name}*${d.quantity || 1}`;
        console.log(`  [${i}] INVENTORY_WITHDRAWAL -> by=${d.employee_name || d.employeeRef} items=${items}`);
      } else {
        console.log(`  [${i}] ${a.intent} -> desc=${a.description?.slice(0, 80)}`);
      }
    });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
