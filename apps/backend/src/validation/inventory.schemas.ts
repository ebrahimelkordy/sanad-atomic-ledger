/**
 * القاعدة #3: DETERMINISTIC INVENTORY & PRICING PARSING
 *
 * لا تُفترض أي default للكمية أو الأسعار إلا بعد استنفاد جميع الخيارات اللغوية لاستخراج
 * القيم الصريحة من النص المصدر (الرسالة الأصلية).
 */

import { z } from 'zod';

export const InventoryProductCreateSchema = z.object({
  name: z
    .string({ required_error: 'اسم المنتج مطلوب' })
    .trim()
    .min(2, { message: 'اسم المنتج قصير جداً' }),
  sku: z.string().trim().optional(),
  /** العدد الإجمالي الفعلي للقطع (بعد حساب الكراتين × عدد القطع في الكرتونة). لا تقبل أبداً 1 كـ default. */
  current_stock: z.coerce
    .number()
    .int({ message: 'كمية المخزون يجب أن تكون رقماً صحيحاً' })
    .nonnegative({ message: 'كمية المخزون لا يمكن أن تكون سالبة' }),
  /** سعر البيع للقطعة الواحدة. */
  unit_price: z.coerce.number().nonnegative(),
  /** سعر التكلفة للقطعة الواحدة (مُحسوب من سعر الكرتونة / عدد القطع عند الاقتضاء). */
  cost_price: z.coerce.number().nonnegative().optional(),
  vertical_metadata: z.record(z.unknown()).optional(),
});

export type ValidatedInventoryProductPayload = z.infer<typeof InventoryProductCreateSchema>;

/* =========================================================
   Stock & Pricing Deterministic Extractor
   ========================================================= */

export type ParsedInventoryContext = {
  rawMessageText?: string;
  rawExtracted?: Record<string, unknown>;
};

type InventoryParseResult = {
  current_stock: number | null;
  unit_price: number | null;
  cost_price: number | null;
  carton_count?: number;
  per_carton?: number;
  carton_cost?: number;
};

/**
 * استخراج حاسم (Deterministic) للكميات والأسعار من السياق اللغوي.
 *
 * الأسبقية:
 *  1. القيم المُصرّحة في الـ raw extraction (qty, cost_price, unit_price).
 *  2. إذا وُجدت كلمات "كراتين/كرتون/علب" نحسب الكمية = cartons × per_carton.
 *  3. إذا وُجد "سعر الكرتونة" نحسب cost_per_piece = carton_cost / per_carton.
 *  4. LAST RESORT فقط: إذا لم يعثر على أي شيء، نرجع null (وليس 1 أو 0).
 */
export function deterministicallyParseInventoryPricing(
  ctx: ParsedInventoryContext,
  fallbacks: { defaultName?: string } = {},
): InventoryParseResult {
  const extracted = ctx.rawExtracted || {};
  const rawText = (ctx.rawMessageText || '').toString();

  const out: InventoryParseResult = {
    current_stock: null,
    unit_price: null,
    cost_price: null,
  };

  // ---------- أولاً: القيم الصريحة من الـ extracted payload ----------
  const explicitQty = firstValidNumber([
    extracted.current_stock,
    extracted.quantity,
    extracted.qty,
    extracted.stock,
    (extracted as any)?.cartons,
  ]);

  const explicitPerCarton = firstValidNumber([
    extracted.per_carton,
    extracted.pieces_per_carton,
    (extracted as any)?.piecesInCarton,
    extracted.units_per_box,
  ]);

  const explicitCartonCount = firstValidNumber([
    extracted.cartons,
    extracted.carton_count,
    extracted.boxes,
  ]);

  const explicitUnit = firstValidNumber([
    extracted.unit_price,
    extracted.selling_price,
    extracted.sale_price,
    extracted.price,
  ]);

  const explicitCostPiece = firstValidNumber([
    extracted.cost_price,
    extracted.purchase_price,
    extracted.buy_price,
  ]);

  const explicitCostCarton = firstValidNumber([
    extracted.carton_cost,
    extracted.carton_price,
    extracted.box_cost,
    (extracted as any)?.cartonPurchasePrice,
  ]);

  // ---------- ثانياً: Regex على النص الأصلي إذا لم تكن القيم واضحة ----------
  const cartonsFromText = explicitCartonCount ?? matchFirstNumber(rawText, /(\d+)\s*(?:كراتين|كرتون|كراتة|علب|صناديق|صندوق)/i);
  const perCartonFromText = explicitPerCarton ?? matchFirstNumber(rawText, /(?:الكرتونة|الكرتون|العلبة|في\s*الكرتون|كل\s*كرتون)[^0-9]{0,20}(\d+)/i);
  const cartonCostFromText = explicitCostCarton ?? matchFirstNumber(rawText, /(?:سعر\s*(?:الكرتون|الكرتونة|العلبة)|شراء\s*(?:الكرتون|الكرتونة))[^0-9]{0,20}(\d+(?:\.\d+)?)/i);
  const unitSaleFromText = explicitUnit ?? matchFirstNumber(rawText, /(?:سعر\s*البيع|بيع\s*القطعة|القطعة.*(?:ل)?بيع|بيع\s*للواحد)[^0-9]{0,20}(\d+(?:\.\d+)?)/i);

  // ---------- ثالثاً: الدمج والحسابات الحاسمة ----------
  const finalCartons = cartonsFromText;
  const finalPerCarton = perCartonFromText;

  if (finalCartons != null && finalPerCarton != null) {
    out.current_stock = finalCartons * finalPerCarton;
    out.carton_count = finalCartons;
    out.per_carton = finalPerCarton;
  } else if (explicitQty != null) {
    out.current_stock = explicitQty;
  } else if (cartonsFromText != null) {
    // نفترض قطعة واحدة في الكرتونة كحل أخير فقط إذا كان نصاً غير واضح
    out.current_stock = cartonsFromText;
    out.carton_count = cartonsFromText;
  }

  const finalCartonCost = cartonCostFromText;
  if (finalCartonCost != null && finalPerCarton != null && finalPerCarton > 0) {
    out.cost_price = Math.round((finalCartonCost / finalPerCarton) * 100) / 100;
    out.carton_cost = finalCartonCost;
  } else if (explicitCostPiece != null) {
    out.cost_price = explicitCostPiece;
  }

  out.unit_price = unitSaleFromText ?? explicitUnit ?? 0;

  // LAST RESORT: إذا لم يجرِ إيجاد كمية → نتركها null (لن تُعامل كـ 1 أبداً)
  // Caller يجب أن يقرر ما إذا كان يرفض أو يطلب توضيح
  void fallbacks;
  return out;
}

function firstValidNumber(values: unknown[]): number | null {
  for (const v of values) {
    if (v == null) continue;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.]/g, ''));
    if (!Number.isNaN(n) && Number.isFinite(n)) return n;
  }
  return null;
}

function matchFirstNumber(text: string, regex: RegExp): number | null {
  if (!text) return null;
  const m = text.match(regex);
  if (!m || !m[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
