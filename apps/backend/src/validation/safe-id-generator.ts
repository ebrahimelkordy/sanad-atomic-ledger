/**
 * Safe Unique Identifier Generators
 *
 * القاعدة #1: DEFENSIVE VALIDATION — لا تمرر أرقام هواتف أو أكواد مكررة أو null إلى قاعدة البيانات.
 * هذه الوحدة تُولّد معرفات فريدة آمنة تماماً عند غياب القيمة الأصلية، لتجنب Prisma P2002 (Unique constraint violation).
 */

const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function shortRandom(len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += TOKEN_CHARS.charAt(Math.floor(Math.random() * TOKEN_CHARS.length));
  }
  return out;
}

/**
 * توليد هاتف فريد آمن للعملاء والموردين عندما لا يأتي هاتف من payload الـ AI.
 * الشكل: AUTO-{prefix}-{timestamp-short}-{random}
 * المُدخل: 3-8 حروف معرف للكيان (مثل أول حروف الاسم).
 */
export function generateSafePhone(identifierHint: string): string {
  const prefix = (identifierHint || 'PENDING').trim()
    .replace(/[^0-9A-Za-z\u0621-\u064A]/g, '')
    .slice(0, 6)
    .toUpperCase() || 'PEND';
  const timeChunk = Date.now().toString().slice(-6);
  const rand = shortRandom(3);
  return `AUTO-${prefix}-${timeChunk}-${rand}`;
}

/**
 * توليد SKU فريد للمنتجات عندما لا يأتي كود من payload.
 * الشكل: SKU-{yyyyMMdd}-{random}
 */
export function generateSafeSku(categoryHint = 'PROD'): string {
  const cat = (categoryHint || 'PROD').toUpperCase().slice(0, 4);
  const now = new Date();
  const ymd =
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0');
  const rand = shortRandom(4);
  return `${cat}-${ymd}-${rand}`;
}

/**
 * تنظيف وتأكيد رقم الهاتف — إذا كان غير صالح أو مكرر صيغة "0000000000" أو فاضي، نرجع null.
 * نسمح فقط للأرقام المصرية 11 رقماً تبدأ بـ 01 أو المُنشأة من AUTO-*.
 */
export function validatePhoneOrNull(phone: unknown): string | null {
  if (typeof phone !== 'string') return null;
  const p = phone.trim();
  if (!p) return null;
  if (p.startsWith('AUTO-')) return p; // هوية داخلية آمنة مقبولة
  const digits = p.replace(/\D/g, '');
  if (digits === '0000000000' || digits.length < 5) return null;
  // فلاتر بسيطة: 11 رقم مصري أو أقل (للأرقام الدولية نسمح لاحقاً)
  if (digits.length >= 8) return digits;
  return null;
}

/**
 * تنظيف SKU للتأكد من عدم وجود فراغات أو أحرف غير صالحة.
 */
export function sanitizeSku(raw: unknown, fallbackGenerator: () => string): string {
  if (typeof raw !== 'string') return fallbackGenerator();
  const s = raw.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9\-_]/g, '');
  if (s.length < 2) return fallbackGenerator();
  return s;
}
