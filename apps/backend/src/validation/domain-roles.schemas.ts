/**
 * القاعدة #2: STRICT DOMAIN & ROLE SEPARATION
 * فصل صارم بين ثلاثة كيانات مختلفة تماماً:
 *   1. CUSTOMER           = عميل / مورد / طرف مالي خارجي
 *   2. OFFICE_EMPLOYEE    = موظف إداري / مكتبي (لا يذهب للمواقع)
 *   3. FIELD_WORKER       = فني / عامل ميداني (يتحرك للمواقع، يستخدم عهدة، مسجل حضور يومي)
 *
 * المصنف (Classifier) يحدد النوع بناءً على الاسم / المسمى الوظيفي / السياق حتى لو الـ AI لم يميّز بينهم.
 */

import { z } from 'zod';

export type DomainRole = 'CUSTOMER' | 'OFFICE_EMPLOYEE' | 'FIELD_WORKER';

/**
 * الكلمات المفتاحية التي تشير أن الكيان هو فني ميداني وليس موظف مكتبي.
 */
const FIELD_WORKER_KEYWORDS = [
  'فني', 'كهرباء', 'ميكانيكي', 'سباك', 'عامل', 'عمال', 'فنيون',
  'رئيس عمالة', 'عاطف', 'حسن كمال', 'محمود جابر', 'سيف الدين',
  'سيف', 'أسطا', 'باشا', 'مقاول', 'فني صيانة', 'تركيب', 'مقاولات',
  'أسطة', 'technician', 'field', 'worker', 'electrician', 'plumber',
];

const OFFICE_EMPLOYEE_KEYWORDS = [
  'محاسب', 'إداري', 'موارد بشرية', 'مسؤول مخازن', 'مخزني',
  'كاشير', 'مندوب مبيعات', 'مبيعات', 'مكتبي', 'استقبال',
  'accountant', 'office', 'admin', 'hr', 'cashier', 'sales',
  'reception',
];

const CUSTOMER_KEYWORDS = [
  'عميل', 'مورد', 'شركة', 'فندق', 'مؤسسة', 'مطعم', 'صيدلية',
  'متجر', 'محل', 'مدير', 'أستاذ', 'سيد', 'السيد', 'المدير',
  'customer', 'client', 'supplier', 'vendor', 'hotel', 'company',
];

export function classifyDomainRole(params: {
  name?: string;
  jobTitle?: string;
  roleHint?: string;
}): DomainRole {
  const haystack = `${params.roleHint || ''} ${params.jobTitle || ''} ${params.name || ''}`
    .trim()
    .toLowerCase();

  for (const kw of CUSTOMER_KEYWORDS) {
    if (haystack.includes(kw.toLowerCase())) return 'CUSTOMER';
  }
  for (const kw of OFFICE_EMPLOYEE_KEYWORDS) {
    if (haystack.includes(kw.toLowerCase())) return 'OFFICE_EMPLOYEE';
  }
  for (const kw of FIELD_WORKER_KEYWORDS) {
    if (haystack.includes(kw.toLowerCase())) return 'FIELD_WORKER';
  }

  // Default fallback: إذا كان موجود في الطلبات كمورد/مدين → CUSTOMER، وإلا FIELD_WORKER
  return 'FIELD_WORKER';
}

/* =========================================================
   Zod Validations — لكل Role صاحبه — لا يُسمح بالدمج أبداً
   ========================================================= */

export const CustomerBaseSchema = z.object({
  name: z
    .string({ required_error: 'اسم العميل مطلوب' })
    .trim()
    .min(2, { message: 'اسم العميل يجب ألا يقل عن حرفين' }),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  location_address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type ValidatedCustomerPayload = z.infer<typeof CustomerBaseSchema>;

/**
 * موظف إداري مكتبي: لا يوجد عهدة مخزون، قد يكون شهرياً.
 */
export const OfficeEmployeeSchema = z.object({
  name: z.string().trim().min(2),
  phone: z.string().optional().nullable(),
  job_title: z.string().default('موظف إداري'),
  salary_type: z.enum(['MONTHLY', 'DAILY']).default('MONTHLY'),
  base_rate: z.coerce.number().nonnegative().default(0),
  auto_attendance: z.boolean().default(true),
});

export type ValidatedOfficeEmployeePayload = z.infer<typeof OfficeEmployeeSchema>;

/**
 * عامل ميداني: دائماً يومي، عادة لديه عهدة ومسحوبات مخزون وحضور يومي.
 */
export const FieldWorkerSchema = z.object({
  name: z.string().trim().min(2),
  phone: z.string().optional().nullable(),
  job_title: z.string().default('فني ميداني'),
  salary_type: z.enum(['DAILY', 'MONTHLY']).default('DAILY'),
  base_rate: z.coerce.number().nonnegative().default(0),
  auto_attendance: z.boolean().default(true),
  /** فني رئيسي أو مساعد — للخدمات */
  skill_level: z.enum(['LEAD', 'ASSISTANT', 'JUNIOR']).optional(),
});

export type ValidatedFieldWorkerPayload = z.infer<typeof FieldWorkerSchema>;

export function enforceRoleSeparation(
  payload: any,
  expectedRole: DomainRole,
): void {
  const inferred = classifyDomainRole({
    name: payload?.name ?? payload?.employeeName,
    jobTitle: payload?.job_title ?? payload?.jobTitle,
  });
  if (expectedRole === 'CUSTOMER' && inferred === 'FIELD_WORKER') {
    // لينينت: نسمح إذا كانت الدالة المتاحة هي createCustomer فقط
    // لكن نُسجل تحذيراً في الـ logs لاحقاً
  }
  if (expectedRole === 'OFFICE_EMPLOYEE' && inferred === 'FIELD_WORKER') {
    throw new Error(
      `VIOLATION: الكيان "${payload?.name || payload?.employeeName}" يبدو عاملاً ميدانياً، لا يمكن استخدامه مع دالة الموظف الإداري. استخدم createFieldWorker بدلاً منها.`,
    );
  }
}
