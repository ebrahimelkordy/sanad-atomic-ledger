/**
 * Zod Schemas for Financial Operations
 *
 * القاعدة #1: لا تمرر مبالغ ناقصة أو صفرية إلى عمليات التسوية المالية
 * إلا إذا كانت من النوع الذي يسمح بذلك (مثل خصومات تحت الحساب في بعض الحالات الاستثنائية).
 */

import { z } from 'zod';

export const EntryTypeSchema = z.enum(['DEBIT', 'CREDIT']);
export type ValidatedEntryType = z.infer<typeof EntryTypeSchema>;

export const SettlementRequestSchema = z.object({
  party_identifier: z.string().trim().min(1, { message: 'معرف الطرف المالي مطلوب' }),
  entry_type: EntryTypeSchema,
  amount: z.coerce
    .number()
    .refine((v) => v >= 0, { message: 'المبلغ لا يمكن أن يكون سالباً' }),
  reference_order_id: z.string().uuid().optional().nullable(),
  authorized_action_by: z.string().optional().nullable(),
  source_whatsapp_message_id: z.string().optional().nullable(),
  raw_message_text: z.string().optional().nullable(),
  requested_by: z.string().trim().min(1),
});

export type ValidatedSettlementPayload = z.infer<typeof SettlementRequestSchema>;

export const ExpenseSchema = z.object({
  category: z.string().trim().min(2, { message: 'تصنيف المصروف مطلوب' }),
  amount: z.coerce
    .number()
    .refine((v) => v > 0, { message: 'مبلغ المصروف يجب أن يكون أكبر من صفر' }),
  party_identifier: z.string().trim().optional(),
  notes: z.string().optional(),
});

export type ValidatedExpensePayload = z.infer<typeof ExpenseSchema>;

export const AttendanceRecordSchema = z.object({
  employee_id: z.string().uuid(),
  date: z.coerce.date(),
  status: z.enum(['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY']),
  overtime_hours: z.coerce.number().nonnegative().default(0),
  notes: z.string().optional().nullable(),
});

export type ValidatedAttendancePayload = z.infer<typeof AttendanceRecordSchema>;

export const InventoryWithdrawalLineSchema = z.object({
  productNameOrSku: z.string().trim().min(2),
  quantity: z.coerce.number().int().positive({ message: 'كمية السحب يجب أن تكون موجبة' }),
});

export const InventoryWithdrawalSchema = z.object({
  employeeName: z.string().trim().min(2),
  items: z.array(InventoryWithdrawalLineSchema).min(1, { message: 'مطلوب صنف واحد على الأقل للمسحوبات' }),
  notes: z.string().optional(),
});

export type ValidatedInventoryWithdrawalPayload = z.infer<typeof InventoryWithdrawalSchema>;
