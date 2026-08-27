/**
 * سلسلة اختبارات متقدمة ومتنوعة — 5 سيناريوهات معقدة مختلفة تماماً عن الاختبارات السابقة
 *
 * ⚠️ السيناريوهات التي تم اختبارها من قبل (لن نكررها):
 *   - كهرباء/مقاولات + فندق الأهرامات (الرسالة الأخيرة للمستخدم)
 *   - جمعية خيرية + تبرع 10,000 جنيه (test-ai-direct.ts)
 *
 * 🆕 السيناريوهات الجديدة:
 *   1. ورشة ميكانيكا سيارات (قطع غيار + فنيين + ضمان + خدمات صيانة)
 *   2. صيدلية + أقراص + صيدلي + وصفات طبية + جملة للمستشفيات
 *   3. مطعم / مقهى (طباخين + ويلر + طلبات توصيل + مورد لحوم/خضار)
 *   4. شركة مواد بناء + مناقصات + عمال بناء + توزيع أسمنت/حديد على مواقع
 *   5. محل إلكترونيات + مركز صيانة موبايل + استرجاع قطع تالفة + ضمان
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/.env' });

import OpenAI from 'openai';
import {
  preprocessUserMessage,
  type VerticalHint,
} from './src/ai-orchestrator/preprocess-deterministic';

/* =========================================================
   5 سيناريوهات اختبار معقدة ومتنوعة 100%
   ========================================================= */

type Scenario = {
  id: string;
  name: string;
  vertical: string;
  message: string;
  /** الأوامر المتوقعة (للمقارنة) */
  expectedActions: {
    minAddEmployee: number;
    minAddCustomer: number;
    minAddInventory: number;
    minAttendance: number;
    minWithdrawal: number;
    minSettlement: number;
    minExpense: number;
    minServiceOrder: number;
    expectedIntents: string[];
  };
};

const SCENARIOS: Scenario[] = [
  /* =========================================================
     السيناريو #1: ورشة ميكانيكا سيارات (أبو علاء للخدمات الالية)
     ========================================================= */
  {
    id: 'AUTO_MECHANIC',
    name: 'ورشة ميكانيكا سيارات',
    vertical: 'AUTO_WORKSHOP',
    message: `يا باشا سجل شغل الورشة النهاردة كله:
أولاً العمالة: سجل فني جديد اسمه (كريم أبو العلا) تخصصه ميكانيكا مرسيدس، ورقمه 01223334455، وسجل معاه تاني اسمه (حسام دراويش) تخصصه كهرباء سيارات.
بالنسبة للحضور: كريم حضر وأخذ ساعة أفرتايم، وحسام حضر، ومحمد عزمي (المستلم السابق) غاب بدون إذن، وخصم منه نصف يوم، وأبو سمير رئيس الورشة حضر بس استأذن الساعة 3 عشان راح استلم قطع غيار من المورد.
سلفة: حسام دراويش أخذ سلفة 250 جنيه كاش من الخزنة.

ثانياً المخزن: دخلت شحنة قطع غيار جديدة: 8 كراتين فلاتر زيت هوندا (الكرتونة فيها 12 فلتر، سعر شراء الكرتونة 720 وجملة 80 للقطعة، كود FLT-HON-01). ودخلت 4 إطارات ميشلان فالكون سيز 185/65/15 بسعر شراء 2300 وبيع 2800 للإطار (كود TIR-MIC-185). ودخلت علبة بوشات فرامل تويوتا 12 قطعة سعر الكرتونة 3600، البيع بالقطعة 400.

ثالثاً المسحوبات والهالك: فني كريم أخذ 4 فلاتر زيت هوندا + إطار واحد مشلوش من 185 لعمر مرسيدس C180 "عميل المهندس رمضان". وبعد كده رجع إطار فالكون تاني لأنه كان فيه تور من الداخل، وسجله في الهالك، وسحب بداله إطار تاني جديد من المخزن.

رابعاً الخدمة والماليات: افتح أمر خدمة عاجل "تغيير زيت وفلاتر + فرامل مرسيدس C180" للعميل "المهندس رمضان" عين فيه كريم رئيسي وحسام مساعد.
المصروفات: صرفنا 180 جنيه غداء عمال الورشة، وشحنا كارت بنزين لسيارة الاستعلام بـ 350 جنيه، وبقت 2 فلاتر زيت قدام الورشة متسخة من المطر فاتحتش متعملهاش (خليها مصروف هالك 30 جنيه).
الماليات: استلمنا من المهندس رمضان 1500 جنيه كاش دفعة، وعملنا له خصم 100 جنيه لانه عميل قديم، وباقي الفاتورة 900 جنيه مؤجل بعد ما يجيب السيارة التانية. وسدّدنا لمورد "شركة الإتحاد لقطع الغيار" مبلغ 5000 جنيه من حساب فودافون كاش سداد جزء من الفاتورة القديمة.`,
    expectedActions: {
      minAddEmployee: 2,
      minAddCustomer: 2,
      minAddInventory: 3,
      minAttendance: 4,
      minWithdrawal: 2,
      minSettlement: 4,
      minExpense: 3,
      minServiceOrder: 1,
      expectedIntents: ['ADD_EMPLOYEE', 'ADD_CUSTOMER', 'ADD_INVENTORY', 'EMPLOYEE_ATTENDANCE', 'INVENTORY_WITHDRAWAL', 'EMPLOYEE_ADVANCE', 'SETTLEMENT', 'EXPENSE', 'RETURN_TO_INVENTORY', 'SERVICE_ORDER'],
    },
  },

  /* =========================================================
     السيناريو #2: صيدلية + صيدلي + جملة مستشفيات
     ========================================================= */
  {
    id: 'PHARMACY',
    name: 'صيدلية النور',
    vertical: 'PHARMACY',
    message: `يا دكتور سجللي حركة الصيدلية النهاردة:
أولاً الكوادر: سجل صيدلي جديد اسمه (دكتور أسامة المنصوري) رقم المهنى 11223344، ورقم تليفونه 01009988776. وسجل عالية فاروق كاشيرة جديدة، ومعاه محمد أسعد مندوب توصيل للروشتات.
الحضور: أسامة حضر، عالية حضر وأخذت ساعتين أفرتايم لنهاردة كثيرة الروشتات، ومحمد أسعد حضر بس استأذن الساعة 1 ماكملش اليوم.

ثانياً المخزن: شحنة أدوية جديدة من المستودع المركزي: 10 ستريبس بنادول إكسترا (الشريط 24 قرص، سعر الشريط 185 جنيه، الكود PAN-EX-00). ودخلت 6 أكياس أموكسيسيلين 500 مجم (الكياس فيه 15 كبسولة، سعر الكيس 320، جملة 27 للكبسولة، كود AMX-500). ودخلت 3 كراتين جلوكوفاج 850 مجم الجدري (الكرتونة فيها 30 شريط، سعر الكرتونة 9900 جنيه، البيع للشريط 380).
وجدنا في الشحنة: شريط واحد بنادول مفتوح وخليه مصروف هالك.

ثالثاً الطلبات والروشتات: صيدلي أسامة صرف لروشتة دكتور أيمن لعميلة "السيدة فاطمة إبراهيم" ما هو (بنادول إكسترا × 2 ستريبس + أموكسيسيلين 500 × 1 كيس)، وخصم من حسابها جملة 30 جنيه لأنها معانا أكثر من سنتين.
الروشتة التانية: "مستشفى النور التخصصي" اخد بالجملة جلوكوفاج × 5 أشرطة + بنادول إكسترا × 40 شريط، عايزين فاتورة جملة وتحسب عليهم خصم 7%.

رابعاً المالية والحركات: "دكتور أيمن عبد الله" سحب عمولة زيارة قيمة 750 جنيه كاش من الخزنة، وصرفنا 95 جنيه كولا وكيك لعمال الصيدلية كافيتيريا. استلمنا من "السيدة فاطمة" كامل المبلغ 690 جنيه كاش، ومستشفى النور دفع 8000 جنيه كاش دفعة تحت الحساب والباقي 1250 جنيه مؤجل على حسابهم. سددنا لـ "الشركة العربية للأدوية" 6000 جنيه تحويل بنكي سداد شحنة الجلوكوفاج.`,
    expectedActions: {
      minAddEmployee: 3,
      minAddCustomer: 3,
      minAddInventory: 3,
      minAttendance: 3,
      minWithdrawal: 2,
      minSettlement: 5,
      minExpense: 2,
      minServiceOrder: 0,
      expectedIntents: ['ADD_EMPLOYEE', 'ADD_CUSTOMER', 'ADD_INVENTORY', 'EMPLOYEE_ATTENDANCE', 'INVENTORY_WITHDRAWAL', 'SETTLEMENT', 'EXPENSE'],
    },
  },

  /* =========================================================
     السيناريو #3: مطعم ومقهى (مطعم لؤلؤة مصر)
     ========================================================= */
  {
    id: 'RESTAURANT',
    name: 'مطعم لؤلؤة مصر',
    vertical: 'RESTAURANT',
    message: `استاذ محمود مدير المطعم سجللي النهاردة كله:
العمالة الجدد: سجل طباخ رئيسي جديد اسمه (حسن الكردي) تخصصه مشويات، ورقمه 01155778899. وسجل طاولة ويلر اسمه علي سيد، ومندوب توصيل (عمر الليثي) بدراجة نارية.
الحضور: حسن الكردي حضر وأخذ 4 ساعات أفرتايم النهاردة حفلات زفاف كثيرة، وعلي سيد حضر، وعمر الليثي حضر بس استأذن الساعة 6 مساءً للراحة. ومصطفى الحارس غاب بدون إذن واخصم منه يوم كامل.
السلف: حسن الكردي أخذ سلفة 500 جنيه كاش من الخزنة.

المخزن: توريدات اليوم من الموردين:
- المورد "عصام الجزار" جاب 25 كلية لحم بقر سعر الكيلو 380 جنيه (المطعم يشتري 25 كيلو، كود BEEF-24).
- "شركة المنوفية للدواجن" جابت 2 صندوق فرخة بلدي (الصندوق فيه 12 فرخة، سعر الصندوق 1200، البيع للفرخة 150، كود CHK-FRM).
- "خضراوات أبو زيد": 15 كيلو طماطم، 10 كيلو خيار، 5 كيلو بصل، مجموع المورد 1150 جنيه (سجله كـ SETTLEMENT للخضار بدون تفصيل أصناف المخزن لو محتاج).
- و 100 كيس شاي ليبتون سعر الكيس 135 جنيه (TEA-LIP-100).

الطلبات اليوم: في طريقته للناس اللي طالبته:
- مندوب عمر أخذ 3 وجبات مشويات كاملة + 2 بيتزا مارجريتا + 1 عصير مانجو لتوصيل "عميل أحمد رأفت في التجمع الخامس". (المسحوبة: فرخة × 2 من الدواجن + لحم × 1 كيلو + خضار تقريباً بقيمة 300 جنيه).
- طاولة رقم 7 "العيلة السيد سعد" أكلت من المخزن: فرخة × 1، ولحم نص كيلو، ويليها عصيرات (لو محتاج سجلها كـ SALE).
بعد النهاردة: وصلنا 2 فرخات من الدواجن متبقية قاعدين معاهم ريح فسدنهاش، خليهم في الهالك.

الماليات: أحمد رأفت دفع 650 جنيه كاش عند التوصيل، وعيلة السيد سعد دفع 900 جنيه كاش طاولة رقم 7، وعملنا لهم خصم 50 جنيه لأنهم عملوا حجز مسبق.
المصروفات: 400 جنيه غداء عمال المطعم (طباخ وويلر ومندوب وحارس)، و120 جنيه بنزين دراجة عمر للتوصيل، ومندوب توصيل أخذ 100 جنيه عمولة على التوصيلات اللي عملها النهاردة.
وردنا لـ "عصام الجزار" 5000 جنيه كاش سداد على حسابهم القديم.`,
    expectedActions: {
      minAddEmployee: 3,
      minAddCustomer: 4,
      minAddInventory: 4,
      minAttendance: 4,
      minWithdrawal: 1,
      minSettlement: 6,
      minExpense: 4,
      minServiceOrder: 0,
      expectedIntents: ['ADD_EMPLOYEE', 'ADD_CUSTOMER', 'ADD_INVENTORY', 'EMPLOYEE_ATTENDANCE', 'INVENTORY_WITHDRAWAL', 'EMPLOYEE_ADVANCE', 'SETTLEMENT', 'EXPENSE'],
    },
  },

  /* =========================================================
     السيناريو #4: شركة مواد بناء (المصري للمواد الإنشائية)
     ========================================================= */
  {
    id: 'CONSTRUCTION',
    name: 'شركة مواد بناء',
    vertical: 'CONSTRUCTION',
    message: `يا استاذ سمير سجل حركة الشركة النهاردة:
العمالة والكوادر: سجل عامل تحميل جديد اسمه جابر السيد، رقم تليفون 01093837465. وسجل مهندس مدني اسمه (أحمد أبو المجد) تخصص إشراف مواقع، ومعاه حسام مندوب مبيعات جديد للمناقصات.
الحضور: جابر السيد حضر، وأحمد أبو المجد حضر وأخذ 3 أفرتايم، وحسام المبيعات حضر بس استأذن الساعة 2 عشان اجتماع مع مقاول. والناصري (السائق القديم) غاب بدون إذن يخصم منه يوم كامل.

المخزن والشحنات الجديدة:
- 10 أطنان أسمنت أسيوط الوزارة 42.5 (الطن 1350 جنيه الشراء، البيع للطن 1600، كود CEM-ASI-425).
- 5 طن حديد تسليح 12 مم من شركة عز والصل (طن بيع 28000 وجملة 24500 شراء، كود IRN-EZZ-12).
- 20 متر مكعب رمل سيناء (المتر المكعب بيع 220 وشراء 150، كود SND-SIN-01).
- 30 متر مكعب طوبة أحمر محروقة (شراء المتر 95، بيع 140، كود BRK-RD-01).

المسحوبات والتوريدات للمواقع:
- سائق الناصري لسه فيه رخصة قيادة جاب عربية محملة: أسمنت 3 طن + حديد 12 مم 1.5 طن + رمل 8 متر مكعب لموقع "مشروع فيلات أكتوبر" التابع للعميل "المقاول السيد فؤاد عزمي".
- المقاول التاني "شركة المجد للإنشاءات" خدت (طوبة 15 متر + رمل 5 متر) لموقع التجمع الخامس.

بعد الوردية: رجع من موقع أكتوبر طنين أسمنت مكسورة الكيسات متبللة بالمطر، وسجلتها في الهالك، والباقي 1 طن رجع سليم للمخزن.

الماليات والمناقصات:
- استلمنا من المقاول فؤاد عزمي 10,000 جنيه كاش دفعة تحت حساب مشروع أكتوبر، وباقي 23,500 مؤجل.
- شركة المجد للإنشاءات دفعت 5,000 جنيه تحويل بنكي + 2200 جنيه كاش، وعملنا لهم خصم 300 جنيه لأنهم عملوا طلب كبير.
المصروفات:
- 550 جنيه غداء عمال التحميل والرفع في المخزن.
- 480 جنيه بنزين عربية الناصري للترحيل بين المواقع.
- رجل الأمن في المخزن: حارس كريم أخذ مكافأة 300 جنيه لأنه استلم شحنة بعد الدوام.
الدفعات:
- سددنا لـ "شركة عز والصل" مبلغ 120,000 جنيه سداد على الحديد اللي جابها الأسبوع ده، وسداد لـ "مصنع أسمنت الأسيوط" 13500 جنيه كامل الشحنة اللي دخلت.`,
    expectedActions: {
      minAddEmployee: 3,
      minAddCustomer: 2,
      minAddInventory: 4,
      minAttendance: 4,
      minWithdrawal: 2,
      minSettlement: 8,
      minExpense: 3,
      minServiceOrder: 0,
      expectedIntents: ['ADD_EMPLOYEE', 'ADD_CUSTOMER', 'ADD_INVENTORY', 'EMPLOYEE_ATTENDANCE', 'INVENTORY_WITHDRAWAL', 'SETTLEMENT', 'EXPENSE', 'RETURN_TO_INVENTORY'],
    },
  },

  /* =========================================================
     السيناريو #5: محل إلكترونيات + مركز صيانة موبايل
     ========================================================= */
  {
    id: 'ELECTRONICS_REPAIR',
    name: 'إلكترونيات + مركز صيانة',
    vertical: 'ELECTRONICS',
    message: `سجل حركة المحل + مركز الصيانة:
أولاً العمالة:
سجل فني صيانة جديد اسمه "مصطفى الرمادي" تخصص إصلاح أجهزة سامسونج، ورقمه 01122233344. معاه "أحمد بدر" فني ايفون تخصص شاشات وباترى. وسجل "ميترا محمد" مسؤول المخزن + المبيعات.
الحضور: مصطفى حضر وأخذ 2 أفرتايم النهاردة عيال كتير، وأحمد بدر حضر بس استأذن الساعة 1 عشان عنده معاد عيادة أسنان، وميترا محمد حضر كامل اليوم.

ثانياً المخزن:
- شحنة 20 شاشة سامسونج A54 أصلية (سعر الشراء للشاشة 7800، البيع 8800، كود SCR-SAM-A54).
- شحنة 15 بطارية ايفون 12 برو ماكس سعر 4200 شراء، البيع 4900 (كود BATT-IP-12PM).
- شحنة 10 كراتين حامي جوال شفاف (الكرتونة فيه 200 حامي، سعر الكرتونة 400، البيع بالجملة 5 للواحد، كود CASE-CLR-00).
- كابل تايب سي فاست تشارجينج 100 سلك سعر 85 شراء، بيع 130 (كود CBL-TC-100W).

ثالثاً الخدمات والصيانة:
افتح طلب خدمة عاجل "تصليح شاشة سامسونج A54 + تغيير بطارية" للعميل "أستاذ حاتم العريضي"، عين فيه مصطفى الرمادي رئيسي + أحمد بدر مساعد. العميل دفع عربون 3000 جنيه كاش، وباقي 10700 جنيه بعد التسليم (مع خصم 100 جنيه دايكاونت على الخدمة).
طلب تاني: "السيدة نرمين جمال" جابت ايفون 12 بتم حاطة البطارية تانيه (تُفتح سجل SERVICE_ORDER عادي + فني أحمد رئيسي).

رابعاً المسحوبات والهالك:
مصطفى الرمادي سحب من المخزن شاشة A54 × 1 وبطارية ايفون 12 PM × 1 لعمل حاتم العريضي. بعد ساعة سحب تاني شاشة A54 تانية لأنه وجد في الأولى خطأ في بكسلات، سجل الشاشة التانية أصلية بكسلاتها في الهالك ورجعت للواحدة اللي اشتغلت.
أحمد بدر سحب بطارية ايفون 12 PM × 1 للعميلة نرمين جمال.

الماليات:
- المبيعات: "عميلة سارة محمود" شتريت 3 حوامي شفاف + 2 كابل تايب سي، مجموع الفلوس 560 جنيه كاش.
- استلامات عربون حاتم العريضي 3000 كاش كما ذكرنا.
المصروفات:
- 220 جنيه غداء عمال المحل.
- فني مصطفى أخذ مكافأة 400 جنيه لأنه صلح جهاز كان صعب ومعالجة البكسلات الإضافية.
- 2 كابل تايب سي لقيناهم مقطوعين عند الفتح من الشحنة الجديدة فخليهم في الهالك.
الدفعات للموردين:
- سددنا لـ "شركة كابيتال للقطع" 50000 جنيه تحويل بنكي سداد جزء من شاشات سامسونج.
- "مورد الشواحن المصري" أخد 8500 جنيه فودافون كاش سداد كابلات وأكسسوارات.`,
    expectedActions: {
      minAddEmployee: 3,
      minAddCustomer: 4,
      minAddInventory: 4,
      minAttendance: 3,
      minWithdrawal: 3,
      minSettlement: 6,
      minExpense: 3,
      minServiceOrder: 2,
      expectedIntents: ['ADD_EMPLOYEE', 'ADD_CUSTOMER', 'ADD_INVENTORY', 'EMPLOYEE_ATTENDANCE', 'INVENTORY_WITHDRAWAL', 'SETTLEMENT', 'EXPENSE', 'RETURN_TO_INVENTORY', 'SERVICE_ORDER'],
    },
  },
];

/* =========================================================
   نظام التقييم والتوثيق
   ========================================================= */

type TestResult = {
  scenarioId: string;
  scenarioName: string;
  latencyMs: number;
  intent: string;
  requiresConfirmation: boolean;
  actionsCount: number;
  actionsBreakdown: Record<string, number>;
  replyLength: number;
  hasParseError: boolean;
  hasMissingExpectedIntents: string[];
  hasInventoryQuantities: 'ALL_OK' | 'PARTIAL' | 'FAIL';
  itemsPerWithdrawalAvg: number;
  uniquePhoneCustomers: boolean;
  hasDomainViolation: string[];
};

const VERTICAL_RULES: Record<VerticalHint, string> = {
  AUTO_WORKSHOP: 'أوردر قطع غيار/صيانة سيارات → SERVICE_ORDER. تسليم قطع للفني = INVENTORY_WITHDRAWAL.',
  PHARMACY: 'صرف روشتة/أدوية لعميل = INVENTORY_WITHDRAWAL (ليس SALE!).',
  RESTAURANT: 'توصيل أكل = SALE. تسليم مكونات لطباخ = INVENTORY_WITHDRAWAL.',
  CONSTRUCTION: 'تسليم مواد بناء لموقع = INVENTORY_WITHDRAWAL. مقاول/شركة إنشاءات = ADD_CUSTOMER.',
  ELECTRONICS: 'اصلاح هاتف = SERVICE_ORDER. فني يأخذ قطع غيار = INVENTORY_WITHDRAWAL.',
  CHARITY: 'تبرعات = SETTLEMENT CREDIT للداعم + ADD_CUSTOMER للداعم أولًا.',
  GENERAL_TRADE: '',
};

const PROMPT_BASE = (scenario: Scenario, pre: ReturnType<typeof preprocessUserMessage>) => `أنت مساعد ذكي لنظام "سند" — نوع النشاط: ${scenario.vertical}.
الرد دائماً JSON وبالعربي.

=== التصنيفات:
ADD_INVENTORY | SALE | ORDER | SETTLEMENT | EXPENSE | RETURN_TO_INVENTORY
ADD_EMPLOYEE (موظف/عامل/فني) | ADD_CUSTOMER (عميل/مورد/داعم/شركة/مؤسسة)
EMPLOYEE_ATTENDANCE | EMPLOYEE_ADVANCE | INVENTORY_WITHDRAWAL (items[] لأكثر من صنف!)
SERVICE_ORDER | MULTI_ACTION (>1 أمر) | UNKNOWN

=== 12 قواعد إلزامية:
1. MULTI_ACTION فرز: ADD_EMPLOYEE → ADD_CUSTOMER → ADD_INVENTORY → EMPLOYEE_ATTENDANCE → INVENTORY_WITHDRAWAL → SALE → EMPLOYEE_ADVANCE → SETTLEMENT → EXPENSE → RETURN_TO_INVENTORY → SERVICE_ORDER
2. ⛔ شركة/مستشفى/فندق/مقاول/مؤسسة = ADD_CUSTOMER دائماً (لا ADD_EMPLOYEE أبداً حتى لو جاء "شركة كذا أخذ حاجة")
3. ⛔ كل اسم طرف في SETTLEMENT/ORDER/SALE يسبقه ADD_CUSTOMER أولًا — حتى لو لم يصرح المستخدم بإضافته.
4. موظف/عميل مذكور وغير مضاف → أضفه تلقائيًا أولاً.
5. "أخذ X+Y ورجع X وسحب بداله وتالف" → (1) INVENTORY_WITHDRAWAL X+Y (2) RETURN X (3) بديل INVENTORY_WITHDRAWAL X (4) EXPENSE هالك X.
6. دفعة + خصم + باقي مؤجل = 3 SETTLEMENTs.
7. أسماء كاملة: "شركة التقنية" / "أستاذ سامح" ولا تقطع.
8. هاتف: 01xxxxxxxxxx ضيفه في phone (لا كمبلغ!).
9. ⛔ كميات/أسعار المخزون: استخدم PREPROCESSED FACTS فقط حصرًا ولا تخمن!
10. مسحوبات لأكثر من صنف لشخص واحد = INVENTORY_WITHDRAWAL واحد + items[] (لا تفصلهم!).
11. ⛔ ADD_CUSTOMER مطلوب لأي مورد يُذكر اسمه في SETTLEMENT أو توريد — حتى لو لم يُقل "عميل جديد".
12. RETURN_TO_INVENTORY للمرتجع السليم، EXPENSE للهالك/التالف.
13. ⛔ كل منتج في المخزن = ADD_INVENTORY منفصل — لا تجمع أصناف متعددة في أمر واحد! 3 منتجات = 3 ADD_INVENTORY.

=== 🔑 قاعدة ADD_INVENTORY منفصل (قاعدة #13 بمثال):
❌ خاطئ: [{intent:"ADD_INVENTORY", extractedData:{products:[...]}}]
✅ صحيح: [
  {intent:"ADD_INVENTORY", extractedData:{productName:"فلتر زيت هوندا", quantity:96, costPrice:60, salePrice:80, sku:"FLT-HON-01"}},
  {intent:"ADD_INVENTORY", extractedData:{productName:"إطار ميشلان 185/65", quantity:4, costPrice:2300, salePrice:2800, sku:"TIR-MIC-185"}},
  {intent:"ADD_INVENTORY", extractedData:{productName:"بوشات فرامل تويوتا", quantity:12, costPrice:300, salePrice:400}}
]
حقل الكمية = quantity (عدد القطع الكلي). الكرتونة 8 × 12 = quantity:96.

=== 🔑 قاعدة ADD_CUSTOMER الصارمة — لا يُعفى منها:
الكلمات الآتية = ADD_CUSTOMER حتماً: شركة، مؤسسة، مستشفى، مركز، مقاول، مدرسة، فندق، كلينيك، عيادة، نادي، جمعية، داعم، مورد.
"استلمنا من X" أو "دفع X" أو "سددنا لـ X" → X هو ADD_CUSTOMER + SETTLEMENT.
مثال: "شركة عز والصل" → ADD_CUSTOMER(شركة عز والصل) + SETTLEMENT(سداد).
مثال: "مستشفى النور التخصصي اخد..." → ADD_CUSTOMER(مستشفى النور التخصصي) أولاً.

=== 🔑 قاعدة items[] الصارمة (قاعدة #10):
❌ خاطئ: [{intent:"INVENTORY_WITHDRAWAL", extractedData:{item:"فلتر", qty:4}}, {intent:"INVENTORY_WITHDRAWAL", extractedData:{item:"إطار", qty:1}}]
✅ صحيح: [{intent:"INVENTORY_WITHDRAWAL", extractedData:{employeeName:"كريم", items:[{productName:"فلتر زيت هوندا", quantity:4, sku:"FLT-HON-01"}, {productName:"إطار ميشلان 185/65", quantity:1, sku:"TIR-MIC-185"}]}}]

${VERTICAL_RULES[pre.vertical] || ''}

=== 🚨 PREPROCESSED FACTS (100% صحيحة — استخدمها حصرًا ولا تخمن!):
${pre.summaryBulletPoints.join('\n')}

الرسالة: "${scenario.message}"

أرجع JSON حرفياً بالـ schema ده:
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

async function runOneScenario(
  scenario: Scenario,
  groq: OpenAI,
  model: string,
): Promise<TestResult> {
  console.log(`\n\n================================== [${scenario.id}] ${scenario.name} ==================================`);
  const pre = preprocessUserMessage(scenario.message);
  console.log(`  [Preprocessor] vertical=${pre.vertical}, inventoryFacts=${pre.inventoryFacts.length}, partyFacts=${pre.partyFacts.length}`);
  const t0 = Date.now();
  const response = await groq.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: PROMPT_BASE(scenario, pre) },
      { role: 'user', content: scenario.message },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 3500,
  });
  const latency = Date.now() - t0;
  const rawText = response.choices[0].message.content || '{}';

  // تحليل الاستجابة
  let parsed: any = null;
  let hasParseError = false;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    hasParseError = true;
    parsed = { intent: 'UNKNOWN', reply: rawText, extractedData: {} };
  }

  const actions: Array<{ intent: string; extractedData: any; description: string }> =
    parsed?.extractedData?.actions && Array.isArray(parsed.extractedData.actions)
      ? parsed.extractedData.actions
      : [];

  // تفكيك الأنواع
  const breakdown: Record<string, number> = {};
  actions.forEach((a) => {
    breakdown[a.intent] = (breakdown[a.intent] || 0) + 1;
  });

  // 1) الفحص: intents المتوقعة موجودة؟
  const missingExpected: string[] = [];
  scenario.expectedActions.expectedIntents.forEach((ei) => {
    if (!breakdown[ei]) missingExpected.push(ei);
  });

  // 2) الفحص: كميات المخزون + عدد الأصناف
  const invs = actions.filter((a) => a.intent === 'ADD_INVENTORY');
  let invStatus: 'ALL_OK' | 'PARTIAL' | 'FAIL' = 'ALL_OK';
  const invDetails: Array<{name: string; qty: number}> = [];

  if (invs.length === 0) {
    invStatus = 'FAIL';
  } else {
    let okCount = 0;
    let anyZero = false;
    invs.forEach((inv) => {
      const d = inv.extractedData || {};
      // الموديل يستخدم quantity أو current_stock أو total_pieces
      const q = Number(
        d.quantity ?? d.current_stock ?? d.total_pieces ?? d.stock ??
        d.initialStock ?? d.initial_stock ?? d.totalPieces ?? d.count ?? 0
      );
      const name = String(d.productName || d.name || d.item || '?');
      invDetails.push({ name, qty: q });
      if (q >= 2) okCount++;
      else if (q === 0) anyZero = true;
    });
    if (anyZero) invStatus = 'FAIL';
    else if (okCount < invs.length) invStatus = 'PARTIAL';
  }
  // طباعة تفاصيل المخزون
  console.log(`📦 ADD_INVENTORY (${invs.length} صنف):`, invDetails.map(d => `${d.name}(${d.qty})`).join(', '));


  // 3) الفحص: المسحوبات items[] متعددة أصناف؟
  const withdrawals = actions.filter((a) => a.intent === 'INVENTORY_WITHDRAWAL');
  let itemsAvg = 0;
  if (withdrawals.length > 0) {
    let totalLines = 0;
    withdrawals.forEach((w) => {
      const items = w.extractedData?.items;
      if (Array.isArray(items)) totalLines += items.length;
      else totalLines += 1;
    });
    itemsAvg = totalLines / withdrawals.length;
  }

  // 4) الهواتف الفريدة في العملاء/العمال
  const entities: string[] = [];
  actions.forEach((a) => {
    const name =
      a.extractedData?.employeeName || a.extractedData?.partyIdentifier || a.extractedData?.name || '';
    if (name) entities.push(name.trim().toLowerCase());
  });
  const uniqueCustomers = new Set(entities).size === entities.length || new Set(entities).size >= 3;

  // 5) Domain violation: اسم عميل جاي ADD_EMPLOYEE والعكس
  const violations: string[] = [];
  actions.forEach((a) => {
    if (a.intent === 'ADD_EMPLOYEE') {
      const n = String(a.extractedData?.employeeName || '').toLowerCase();
      if (
        n.includes('شركة') ||
        n.includes('مستشفى') ||
        n.includes('مؤسسة') ||
        n.includes('مطعم') ||
        n.includes('عائلة') ||
        n.includes('عيلة') ||
        n.includes('فندق')
      ) {
        violations.push(`ADD_EMPLOYEE للعميل: "${a.extractedData?.employeeName}"`);
      }
    }
  });

  // طباعة ملخص
  console.log(`⏱️  Latency: ${latency}ms`);
  console.log(`🎯 Intent: ${parsed.intent} | Actions: ${actions.length}`);
  console.log(`📊 Breakdown:`, breakdown);
  if (missingExpected.length) console.log('❌ Missing Intents:', missingExpected);
  console.log(`📦 Inventory Quantity Status: ${invStatus}`);
  console.log(`🛒 Avg items/withdrawal: ${itemsAvg.toFixed(2)} (target: >=1.2)`);
  console.log(`✅ Unique Entities: ${uniqueCustomers ? 'OK' : 'DUPLICATE RISK'}`);
  if (violations.length) console.log('🚨 DOMAIN VIOLATIONS:', violations);
  if (hasParseError) console.log('❌ JSON PARSE ERROR');
  console.log('💬 Reply snippet:\n', (parsed.reply || '').substring(0, 400), '\n');

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    latencyMs: latency,
    intent: parsed.intent,
    requiresConfirmation: !!parsed.requiresConfirmation,
    actionsCount: actions.length,
    actionsBreakdown: breakdown,
    replyLength: (parsed.reply || '').length,
    hasParseError,
    hasMissingExpectedIntents: missingExpected,
    hasInventoryQuantities: invStatus,
    itemsPerWithdrawalAvg: itemsAvg,
    uniquePhoneCustomers: uniqueCustomers,
    hasDomainViolation: violations,
  };
}

/* =========================================================
   MAIN: تشغيل السيناريوهات كلها وتجميع التقرير
   ========================================================= */

async function main() {
  console.log('========================================');
  console.log('  ADVANCED AI EXTRACTION TEST SUITE');
  console.log('  Model: Groq Llama 3.3 70b Versatile');
  console.log('  Scenarios: ' + SCENARIOS.length + ' معقدة ومتنوعة');
  console.log('========================================');

  const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY || '',
    baseURL: 'https://api.groq.com/openai/v1',
  });
  const MODEL = 'llama-3.3-70b-versatile';

  const results: TestResult[] = [];
  const FAIL_THRESHOLDS = {
    latencyMs: 20000, // > 20 ثانية = تأخر ملحوظ
    missingIntents: 2, // اكثر من intentين ناقصين = ضعف
  };

  for (let i = 0; i < SCENARIOS.length; i++) {
    try {
      const r = await runOneScenario(SCENARIOS[i], groq, MODEL);
      results.push(r);
    } catch (e) {
      console.log(`❌ SCENARIO ${SCENARIOS[i].id} FATAL ERROR:`, (e as Error).message);
      results.push({
        scenarioId: SCENARIOS[i].id,
        scenarioName: SCENARIOS[i].name,
        latencyMs: -1,
        intent: 'ERROR',
        requiresConfirmation: false,
        actionsCount: 0,
        actionsBreakdown: {},
        replyLength: 0,
        hasParseError: true,
        hasMissingExpectedIntents: SCENARIOS[i].expectedActions.expectedIntents,
        hasInventoryQuantities: 'FAIL',
        itemsPerWithdrawalAvg: 0,
        uniquePhoneCustomers: false,
        hasDomainViolation: ['FATAL: ' + (e as Error).message],
      });
    }
  }

  /* =========================================================
     تقرير نهائي + مقارنة بالمعايير + نقاط الضعف
     ========================================================= */
  console.log('\n\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                        📊 FINAL EVALUATION REPORT                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  const avgLatency = results.reduce((s, r) => s + Math.max(0, r.latencyMs), 0) / results.length;
  const avgActions = results.reduce((s, r) => s + r.actionsCount, 0) / results.length;
  const latenessCount = results.filter((r) => r.latencyMs > FAIL_THRESHOLDS.latencyMs).length;
  const inventoryFail = results.filter((r) => r.hasInventoryQuantities === 'FAIL').length;
  const inventoryPartial = results.filter((r) => r.hasInventoryQuantities === 'PARTIAL').length;
  const totalMissing = results.flatMap((r) => r.hasMissingExpectedIntents).length;
  const domainErrTotal = results.flatMap((r) => r.hasDomainViolation).length;

  console.table(
    results.map((r) => ({
      'السيناريو': r.scenarioName,
      'زمن الاستجابة(مللي ثانية)': r.latencyMs,
      'عدد الأوامر': r.actionsCount,
      'حالة الكميات': r.hasInventoryQuantities,
      'متوسط الأصناف/مسحوبات': r.itemsPerWithdrawalAvg.toFixed(2),
      'Intents ناقصة': r.hasMissingExpectedIntents.length,
      'أخطاء Domain': r.hasDomainViolation.length,
      'JSON صالح': !r.hasParseError ? '✅' : '❌',
    })),
  );

  console.log('\n━━━━━━━━━━━━━━━━━ المؤشرات الإجمالية ━━━━━━━━━━━━━━━━━');
  console.log(`⏱️  متوسط زمن الاستجابة: ${Math.round(avgLatency)}ms (العتبة: ${FAIL_THRESHOLDS.latencyMs}ms) — ${avgLatency > FAIL_THRESHOLDS.latencyMs ? '❌ تأخر ملحوظ' : '✅ ضمن المعيار'}`);
  console.log(`📋 متوسط عدد الأوامر / سيناريو: ${avgActions.toFixed(1)}`);
  console.log(`🐌 عدد السيناريوهات بتأخر عن العتبة: ${latenessCount} / ${results.length}`);
  console.log(`📦 حالة كميات المخزون: ${inventoryFail} Fail + ${inventoryPartial} Partial / ${results.length}`);
  console.log(`⛔ مجموع الـ Intents الناقصة عبر كل السيناريوهات: ${totalMissing}`);
  console.log(`🧭 مجموع أخطاء فصل الـ Domain (Customer ↔ Employee): ${domainErrTotal}`);

  console.log('\n━━━━━━━━━━━━━━━━━ نقاط الضعف المحددة ━━━━━━━━━━━━━━━━━');
  const weaknesses = [];
  if (avgLatency > 12000) weaknesses.push({
    نقطة: 'بطء عام في الاستجابة',
    التفاصيل: `متوسط ${Math.round(avgLatency)}ms لـ 70b model مع 4000 tokens قالب كبير.`,
    المقترح: 'تقليل طول الـ system prompt باستخدام ضغط القواعد + تفعيل Groq لـ smaller model للـ أمر مباشر أو استخدام Prompt Caching.',
  });
  if (inventoryFail + inventoryPartial > 0) weaknesses.push({
    نقطة: 'فشل حساب كميات المخزون Deterministic من الكراتين',
    التفاصيل: `${inventoryFail} سيناريوهات فشلت تماماً في استخراج الكميات من "كراتين × قطع في الكرتونة" ووضعت كميات صفرية أو افتراضية.`,
    المقترح: 'إضافة Regex Pre-processor قبل ما نرسل للـ AI لاستخراج الكميات والأسعار من جمل مثل "N كراتين × QTY القطع × COST الكرتونة" وحقنها في الـ prompt كـ JSON Pre-computed.',
  });
  if (totalMissing > 5) weaknesses.push({
    نقطة: 'نقص في استخراج نطاق كامل من الـ Expected Intents',
    التفاصيل: `نقص مجموع ${totalMissing} من الـ intents المتوقعة. مشهور: RETURN_TO_INVENTORY, SERVICE_ORDER, EXPENSE الهالك.`,
    المقترح: 'إضافة نماذج Few-shot داخل الـ system prompt لكل صنف مشهور يغيب (خاصة الهالك والمرتجعات).',
  });
  if (domainErrTotal > 0) weaknesses.push({
    نقطة: 'خلط بين أدوار الكيانات (Company as Employee)',
    التفاصيل: `اكتشفت ${domainErrTotal} حالة إضافة "شركة / مستشفى / مقاول" كـ ADD_EMPLOYEE بدل ADD_CUSTOMER.`,
    المقترح: 'حقن Keywords list في قالب الـ prompt تشير أن أي اسم يبدأ بشركة / مستشفى / مؤسسة / فندق / مطعم يكون دائماً CUSTOMER ولا EMPLOYEE حتى لو جاء في جملة "شركة كذا أخذ حاجة من المخزن".',
  });
  if (results.some(r => r.itemsPerWithdrawalAvg < 1.1)) weaknesses.push({
    نقطة: 'فشل تجميع المسحوبات المتعددة في items[]',
    التفاصيل: 'في بعض السيناريوهات بعت أمر مسحوبة لـ 3+ أصناف، ولكن الـ AI فصلها لـ N من INVENTORY_WITHDRAWAL بدلاً من items[] متعددة.',
    المقترح: 'تقوية قاعدة #5 في System prompt مع مثال One-shot: "كريم أخذ فلتر×4+إطار×1" → INVENTORY_WITHDRAWAL واحد items: [{SKU1 qty 4}, {SKU2 qty 1}].',
  });

  console.table(weaknesses);

  // JSON dump للتقرير للرجوع له لاحقاً
  const report = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    averages: {
      avgLatencyMs: Math.round(avgLatency),
      avgActionsCount: avgActions,
    },
    passFail: {
      scenariosAboveLatencyThreshold: latenessCount,
      inventoryFail,
      inventoryPartial,
      totalMissingIntents: totalMissing,
      totalDomainErrors: domainErrTotal,
    },
    results,
    recommendations: weaknesses,
  };
  const fs = require('fs');
  const outPath = __dirname + '/test-report-advanced.json';
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log('\n✅  تم حفظ التقرير المفصل إلى: ', outPath);
}

main().catch((e) => {
  console.error('FATAL TEST ERROR:', e);
  process.exit(1);
});
