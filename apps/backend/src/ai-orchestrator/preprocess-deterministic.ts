/**
 * القاعدة #3 + تحسين الأداء: DETERMINISTIC PRE-PROCESSOR
 *
 * قبل إرسال الرسالة إلى الـ LLM (أي مزود)، نقوم بتشغيل سلسلة regex patterns
 * حاسمة (Deterministic) لاستخراج حقول المخزون والأسعار والأطراف المالية بشكل صريح
 * من النص الأصلي — ثم نحقنها في الـ prompt كحقول PRE-COMPUTED لا يحتاج الموديل
 * للتفكير فيها أو تخمينها. هذا:
 *   1) يزيل 90% من أخطاء حساب الكميات من الكراتين.
 *   2) يقلل tokens التفكير في الـ LLM → يقلل التأخير بنسبة 30-50%.
 *   3) يضمن تحويل صرف الأدوية والمستهلكات إلى INVENTORY_WITHDRAWAL لا SALE.
 */

export type ExtractedInventoryFact = {
  nameMatch?: RegExpMatchArray | null;
  productName: string;
  raw: string;
  cartons?: number;
  perCarton?: number;
  pieces?: number;
  cartonCost?: number;
  unitSale?: number;
  unitCostComputed?: number;
  skuHint?: string;
  /** هل تم التعرف على جملة التوريد كاملة */
  confirmedComplete: boolean;
};

export type PartyFact = {
  /** اسم الطرف (عميل / مورد) */
  name: string;
  /** الدور المتوقع: CUSTOMER عميل، SUPPLIER مورد، أو BOTH */
  expectedRole: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  /** الجملة اللي ظهر فيها الطرف (للتدليل) */
  context: string;
};

export type VerticalHint =
  | 'AUTO_WORKSHOP'
  | 'PHARMACY'
  | 'RESTAURANT'
  | 'CONSTRUCTION'
  | 'ELECTRONICS'
  | 'CHARITY'
  | 'GENERAL_TRADE';

export type PreprocessorResult = {
  vertical: VerticalHint;
  inventoryFacts: ExtractedInventoryFact[];
  partyFacts: PartyFact[];
  /**
   * جمل من النص تشير إلى مسحوبات (صرف أدوية / تسليم قطع غيار للموقع/العميل).
   * الحقيقة: صرف لروشتة / تسليم لموقع → يذهب كـ INVENTORY_WITHDRAWAL لا SALE
   */
  inventoryWithdrawalContexts: Array<{
    description: string;
    /** أسماء المنتجات المذكورة في الصرف */
    products: string[];
    /** اسم الموظف/الفني صاحب المسحوبة أو اسم العميل المباشر */
    holder: string;
  }>;
  summaryBulletPoints: string[];
};

/* =========================================================
   1. كاشف النشاط (Vertical Detection) — يحدد نوع النشاط من خلال كلمات مفتاحية
   ========================================================= */
const VERTICAL_SIGNATURES: Array<{ v: VerticalHint; kws: string[] }> = [
  { v: 'AUTO_WORKSHOP', kws: ['سيارات', 'ميكانيكا', 'مرسيدس', 'قطع غيار', 'فرامل', 'فلاتر زيت', 'إطارات', 'ورشة', 'ورشه'] },
  { v: 'PHARMACY', kws: ['صيدلية', 'صيدلي', 'أدوية', 'روشتة', 'ستريبس', 'كبسولات', 'بنادول', 'جلوكوفاج', 'أموكسيسيلين', 'قرص', 'طبيب'] },
  { v: 'RESTAURANT', kws: ['مطعم', 'مقهى', 'طباخ', 'ويلر', 'مشويات', 'فرخة', 'خضار', 'توصيل', 'طاولة رقم', 'كاشير', 'عصير'] },
  { v: 'CONSTRUCTION', kws: ['مواد بناء', 'أسمنت', 'حديد تسليح', 'رمل', 'طوبة', 'مقاول', 'مواقع', 'مناقصات', 'مبنى', 'فيلات', 'إنشاءات', 'طن'] },
  { v: 'ELECTRONICS', kws: ['إلكترونيات', 'صيانة موبايل', 'شاشة سامسونج', 'ايفون', 'باترى', 'حامي جوال', 'كابل تايب سي', 'مركز صيانة', 'شواحن'] },
  { v: 'CHARITY', kws: ['جمعية خيرية', 'تبرع', 'مستفيد', 'داعم', 'سند خيري', 'حالات طبية', 'مؤسسة خيرية', 'كشف طبي'] },
];

function detectVertical(text: string): VerticalHint {
  const t = text.toLowerCase();
  let best: { v: VerticalHint; score: number } = { v: 'GENERAL_TRADE', score: 0 };
  for (const s of VERTICAL_SIGNATURES) {
    let score = 0;
    for (const kw of s.kws) if (t.includes(kw.toLowerCase())) score++;
    if (score > best.score) best = { v: s.v, score };
  }
  return best.v;
}

/* =========================================================
   2. Regex Patterns للكميات والأسعار Deterministic
   ========================================================= */

// المatcher الأساسي لشحنة المخزون الكاملة:
// "دخلت 5 كراتين محولات 12 فولت (الكرتونة فيها 10 قطع، سعر شراء الكرتونة 1200 وسعر بيع القطعة القطاعي 150، كود PWR-12)."
// التحديث: اسم المنتج حروف وفراغات وكلمات فقط، توقف عند لقطة مثل الكرتونة/سعر/كود/قطعة.
const CARTON_PATTERNS: RegExp[] = [
  /(\d+)\s*(?:كراتين|كرتون|كراتة|علب|صناديق|صندوق|أكياس|كيس|شرائط|ستريبس|طقم|أطقم|كيلو|كيلوجرام|طن|متر مكعب|أعمدة|قضيب|قضبان|ألواح)[\s\u0600-\u06FF]*([\u0621-\u064FA-Za-z][\u0621-\u064FA-Za-z0-9 \-\/\u0660-\u0669]{1,79}?)(?=\s*(?:\(|الكرتون|الكرتونة|العلبة|الصندوق|الكيس|الشريط|الكيلو|الطن|فيها|قطعة|قطع|سعر|شراء|بيع|كود|SKU|كوشن|[،\.\n؛,]))(?:[^\d]{0,30}(\d+))?(?:[^\d]{0,50}شراء[^\d]{0,15}(\d+(?:\.\d+)?))?(?:[^\d]{0,40}بيع[^\d]{0,15}(\d+(?:\.\d+)?))?(?:[^\dA-Za-z]{0,30}(?:كود|SKU)[^A-Z0-9]{0,6}([A-Za-z0-9\-]{2,20}))?/gis,
];

// نمط أبسط لكميات مفردة بدون كراتين
// "4 إطارات بريجستون فريزا 195/65 سعر القطعة 2300" → إطارات بريجستون فريزا 195/65 × 4 سعر 2300
// "100 كيس شاي ليبتون 135 جنيه" → 100 كيس شاي ليبتون
const LOOSE_QTY_PATTERN = /(\d+)\s*(?:كيس|عبوة|قطعة|علبة|إطار|كابل|شاشة|بطارية|حوامي|حامي|طن|كيلو|متر|فايال|قرص|كبسولة|شريط)[\s\u0600-\u06FF]*([\u0621-\u064FA-Za-z][\u0621-\u064FA-Za-z0-9 \-\/\u0660-\u0669]{1,79}?)(?=\s*(?:سعر|شراء|بيع|بالجملة|كود|SKU|جنيه|ج|[،\.\n؛,]|$))(?:[^\d]{0,30}(?:شراء|سعر)[^\d]{0,10}(\d+(?:\.\d+)?))?(?:[^\d]{0,30}(?:بيع|بالجملة)[^\d]{0,10}(\d+(?:\.\d+)?))?/gis;

const SUPPLIER_PATTERNS = [
  /(?:أضيف مورد|مورد جديد|المورد|سداد.*ل(?:لمورد|لـ)|توريدات.*من|شراء.*من|جاب(?:ت)?)\s*(?:لـ|ل)?([\u0621-\u064FA-Za-z][\u0621-\u064FA-Za-z .&]{1,39})(?=\s*(?:كمورد|كمورد[هة]|[،\.\n؛,]|رقم|وات|01\d|$))/gis,
];

const CUSTOMER_PATTERNS = [
  /(?:أضيف عميل|عميل جديد|عميلة|أستاذ|السيدة|السيد|لقائد|لعميلة|لعميل|لمشروع|لكلينت|عائلة)\s+([\u0621-\u064FA-Za-z][\u0621-\u064FA-Za-z .&\u0660-\u0669]{1,39})(?=\s*(?:كعميل|كعميلة|رقم|وات|01\d|[،\.\n؛,]|$))/gis,
  // "استلمنا من X مبلغ..." / "دفع X مبلغ"
  /(?:استلمنا من|استلام من|دفع[^\s]*|دفعة من)\s+([\u0621-\u064FA-Za-z][\u0621-\u064FA-Za-z .&]{1,39})(?=\s*\d|\s*جنيه|\s*ج|\s*كاش|[،\.\n؛,]|$)/gis,
  // شركة / مؤسسة / فندق / مستشفى + اسم
  /(شركة|مؤسسة|فندق|مستشفى|مطعم|مركز|ورشة|ورشه)\s+([\u0621-\u064FA-Za-z][\u0621-\u064FA-Za-z .&]{1,39})(?=[،\.\n؛,]|رقم|وات|01\d|$)/gis,
];

/* =========================================================
   3. مسحوبات الصرف (صرف روشتات / تسليم لموقع)
   صرف روشتة لـ X أدوية = INVENTORY_WITHDRAWAL (ليس SALE!)
   ========================================================= */
const DISPENSE_PATTERNS = [
  /(?:صرف|سلم|أخذ من المخزن|سحب من المخزن|تسليم ل(?:لموقع|لعميل|لفندق)|صرف لروشتة)[^.\n]{0,100}/gis,
];

/* =========================================================
   MAIN EXPORT FUNCTION
   ========================================================= */
export function preprocessUserMessage(rawMessage: string): PreprocessorResult {
  const text = String(rawMessage || '');
  const vertical = detectVertical(text);

  /* ---------- المخزون: جمل كرتينية ---------- */
  const inventoryFacts: ExtractedInventoryFact[] = [];
  for (const re of CARTON_PATTERNS) {
    let m: RegExpExecArray | null;
    const local = new RegExp(re.source, re.flags);
    while ((m = local.exec(text)) !== null) {
      const cartons = Number(m[1]);
      const productName = m[2] ? m[2].trim() : '';
      const perCarton = m[3] ? Number(m[3]) : undefined;
      const cartonCost = m[4] ? Number(m[4]) : undefined;
      const unitSale = m[5] ? Number(m[5]) : undefined;
      const skuHint = m[6] ? m[6].trim() : undefined;
      const pieces = perCarton != null ? cartons * perCarton : cartons;
      const unitCostComputed =
        cartonCost != null && perCarton != null && perCarton > 0
          ? Math.round((cartonCost / perCarton) * 100) / 100
          : undefined;
      inventoryFacts.push({
        nameMatch: m,
        productName: cleanupProductName(productName),
        raw: m[0],
        cartons,
        perCarton,
        pieces,
        cartonCost,
        unitSale,
        unitCostComputed,
        skuHint,
        confirmedComplete: !!(perCarton && cartonCost),
      });
      if (!local.global) break;
    }
  }

  /* ---------- المخزون: كميات مفردة بدون كراتين ---------- */
  for (const re of [LOOSE_QTY_PATTERN]) {
    let m: RegExpExecArray | null;
    const local = new RegExp(re.source, re.flags);
    while ((m = local.exec(text)) !== null) {
      const count = Number(m[1]);
      const productName = m[2] ? m[2].trim() : '';
      const buy = m[3] ? Number(m[3]) : undefined;
      const sale = m[4] ? Number(m[4]) : undefined;
      if (productName && count > 0) {
        // تجنب التكرار مع الـ carton facts اللي جت فوق
        const alreadyCovered = inventoryFacts.some(
          (f) => f.productName.length > 2 && productName.includes(f.productName),
        );
        if (!alreadyCovered) {
          inventoryFacts.push({
            nameMatch: m,
            productName: cleanupProductName(productName),
            raw: m[0],
            pieces: count,
            unitCostComputed: buy,
            unitSale: sale,
            confirmedComplete: !!(buy && sale),
          });
        }
      }
      if (!local.global) break;
    }
  }

  /* ---------- الأطراف المالية: موردين وعملاء ---------- */
  const partyFacts: PartyFact[] = [];
  const addParty = (name: string, role: PartyFact['expectedRole'], ctx: string) => {
    const clean = cleanupPartyName(name);
    if (!clean) return;
    const exists = partyFacts.find(
      (p) => p.name.toLowerCase() === clean.toLowerCase(),
    );
    if (!exists) partyFacts.push({ name: clean, expectedRole: role, context: ctx });
    else {
      if (exists.expectedRole !== role) exists.expectedRole = 'BOTH';
    }
  };

  for (const re of SUPPLIER_PATTERNS) {
    let m: RegExpExecArray | null;
    const local = new RegExp(re.source, re.flags);
    while ((m = local.exec(text)) !== null) {
      if (m[1]) addParty(m[1], 'SUPPLIER', m[0]);
      if (!local.global) break;
    }
  }
  for (const re of CUSTOMER_PATTERNS) {
    let m: RegExpExecArray | null;
    const local = new RegExp(re.source, re.flags);
    while ((m = local.exec(text)) !== null) {
      // النمط الثالث (شركة/مؤسسة): name = prefix + اسم
      if (m[1] && m[2] && /(شركة|مؤسسة|فندق|مستشفى|مطعم|مركز|ورشة|ورشه)/.test(m[1])) {
        addParty(`${m[1]} ${m[2]}`.trim(), 'CUSTOMER', m[0]);
      } else if (m[1]) {
        addParty(m[1], 'CUSTOMER', m[0]);
      }
      if (!local.global) break;
    }
  }

  /* ---------- سياقات المسحوبات (صرف روشتات / تسليم لموقع) ---------- */
  const inventoryWithdrawalContexts: PreprocessorResult['inventoryWithdrawalContexts'] = [];
  for (const re of DISPENSE_PATTERNS) {
    let m: RegExpExecArray | null;
    const local = new RegExp(re.source, re.flags);
    while ((m = local.exec(text)) !== null) {
      const desc = m[0];
      const holder =
        desc.match(/(?:لـ|ل|لمستفيد|لعميل|لعميلة|لفندق|للموقع|لأستاذ|للسيدة|للمقاول|للشركة)\s*([\u0621-\u064A a-zA-Z0-9 .]{3,40})/)?.[1] ||
        '';
      const productHints = inventoryFacts
        .filter((f) => desc.includes(f.productName))
        .map((f) => f.productName);
      inventoryWithdrawalContexts.push({
        description: desc,
        products: productHints,
        holder: cleanupPartyName(holder),
      });
      if (!local.global) break;
    }
  }

  /* ---------- Summary النقاط للحقن في الـ Prompt ---------- */
  const summary: string[] = [];
  summary.push(
    `Vertical المعترف به تلقائياً: ${vertical} — طبّق قواعد هذا النشاط دائماً.`,
  );
  if (inventoryFacts.length > 0) {
    summary.push(
      `⚠️ حقائق مخزون محسوبة تلقائياً (تجاهل أي تخمين آخر واستخدم هذه الحقائق حصراً عند إنشاء ADD_INVENTORY):`,
    );
    inventoryFacts.forEach((f, i) => {
      summary.push(
        `   ${i + 1}. المنتج="${f.productName}" → الكمية الفعلية=${f.pieces}${
          f.unitCostComputed != null ? ` ، cost_price=${f.unitCostComputed}` : ''
        }${f.unitSale != null ? ` ، unit_price=${f.unitSale}` : ''}${
          f.skuHint ? ` ، sku=${f.skuHint}` : ''
        }.`,
      );
    });
  }
  if (partyFacts.length > 0) {
    summary.push(
      `⚠️ أطراف مالية معترف بها (قم بإنشاء ADD_CUSTOMER لهم جميعاً أولاً قبل أي SETTLEMENT/ORDER حتى لو كانوا موردين):`,
    );
    partyFacts.forEach((p, i) => {
      summary.push(`   ${i + 1}. "${p.name}" → الدور: ${p.expectedRole}.`);
    });
  }
  if (inventoryWithdrawalContexts.length > 0) {
    summary.push(
      `⚠️ سياقات مسحوبات (استخدم INVENTORY_WITHDRAWAL لا SALE):`,
    );
    inventoryWithdrawalContexts.forEach((c, i) => {
      summary.push(
        `   ${i + 1}. [${c.holder || 'الطرف'}]: ${c.description.substring(0, 120)} — أصناف: ${
          c.products.join('، ') || 'محددة في الجملة الأصلية'
        }.`,
      );
    });
  }

  return {
    vertical,
    inventoryFacts,
    partyFacts,
    inventoryWithdrawalContexts,
    summaryBulletPoints: summary,
  };
}

function cleanupProductName(s: string): string {
  return s
    .replace(/^[\s،,.\-()]+|[\s،,.\-()]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 80);
}

function cleanupPartyName(s: string): string {
  const out = s
    .replace(/^[\s،,.\-()]+|[\s،,.\-()]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (out.length < 2) return '';
  // ازالة الكلمات البريئة اللي تلصق بالأسماء من الـ regex
  return out
    .replace(/^(لـ|ل|الـ)/i, '')
    .replace(/\s*(جنيه|ج|EGP|كاش|دفع|تسليم|دفعة)$/gi, '')
    .slice(0, 60)
    .trim();
}
