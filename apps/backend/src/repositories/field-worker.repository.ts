/**
 * القاعدة #2: STRICT DOMAIN & ROLE SEPARATION
 * FieldWorkerRepository = خاص بالعمالة الميدانية / الفنيين فقط.
 *
 * لا يُستخدم هذا الملف أبداً لإدارة الموظفين الإداريين أو العملاء.
 * - الدالة: createFieldWorker() للفنيين/العمال فقط.
 * - الـ finders مع الفلترة على job_title يُفضل أن تكون مهنية.
 */
import { Injectable } from '@nestjs/common';
import { AttendanceStatus, Employee, EmployeeTxType, Prisma, SalaryType } from '@prisma/client';
import { PrismaService } from './prisma.service';
import {
  FieldWorkerSchema,
  ValidatedFieldWorkerPayload,
  generateSafePhone,
  validatePhoneOrNull,
} from '../validation';

export type { ValidatedFieldWorkerPayload };

export type CreateFieldWorkerInput = ValidatedFieldWorkerPayload & {
  tenant_id: string;
};

/**
 * مفهوم: الـ Field Worker يتم تخزينه فعلياً في نفس جدول employees في Prisma
 * (لأنه نفس الكيان عند قاعدة البيانات)، لكننا نفصل الخدمة لفرض قواعد Domain مختلفة:
 *   - salary_type دائماً DAILY افتراضياً (لا شهري)
 *   - auto_attendance = true دائماً تقريباً
 *   - دائماً يُسمح بربط العهدة والمسحوبات والخدمات الميدانية به
 */
@Injectable()
export class FieldWorkerRepository {
  constructor(private readonly prisma: PrismaService) {}

  private static normalize(input: CreateFieldWorkerInput): Prisma.XOR<Prisma.EmployeeCreateInput, Prisma.EmployeeUncheckedCreateInput> {
    const validated = FieldWorkerSchema.parse(input);

    // القاعدة #1: توليد هاتف فريد آمن إذا لم يكن موجود أو صالح
    let phone = validatePhoneOrNull(validated.phone);
    if (!phone) {
      phone = generateSafePhone(validated.name);
    }

    const salaryType: SalaryType = (validated.salary_type as SalaryType) || 'DAILY';

    return {
      tenant_id: input.tenant_id,
      name: validated.name,
      phone,
      job_title: validated.job_title,
      salary_type: salaryType,
      base_rate: validated.base_rate,
      auto_attendance: validated.auto_attendance ?? true,
    };
  }

  async findByTenantId(tenantId: string, tx?: Prisma.TransactionClient): Promise<Employee[]> {
    const client = tx ?? this.prisma;
    return client.employee.findMany({
      where: { tenant_id: tenantId },
      include: { attendances: true, transactions: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async findById(tenantId: string, id: string, tx?: Prisma.TransactionClient): Promise<Employee | null> {
    const client = tx ?? this.prisma;
    return client.employee.findFirst({
      where: { id, tenant_id: tenantId },
      include: { attendances: true, transactions: true },
    });
  }

  async findByNameOrCreate(
    tenantId: string,
    input: CreateFieldWorkerInput,
    tx?: Prisma.TransactionClient,
  ): Promise<{ worker: Employee; created: boolean }> {
    const client = tx ?? this.prisma;
    const normalized = FieldWorkerRepository.normalize(input);

    let existing = await client.employee.findFirst({
      where: {
        tenant_id: tenantId,
        name: { equals: normalized.name, mode: 'insensitive' },
      },
    });
    if (existing) return { worker: existing, created: false };

    if (normalized.phone) {
      existing = await client.employee.findFirst({
        where: {
          tenant_id: tenantId,
          phone: normalized.phone,
        },
      });
      if (existing) return { worker: existing, created: false };
    }

    // القاعدة #1: حماية P2002 مع regenerate هاتف فريد إضافي في حالات التصادم النادرة
    try {
      const created = await client.employee.create({ data: normalized });
      return { worker: created, created: true };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const collisionSafe = {
          ...normalized,
          phone: generateSafePhone(normalized.name + '-DUPE-' + Date.now().toString()),
        };
        const created = await client.employee.create({ data: collisionSafe });
        return { worker: created, created: true };
      }
      throw e;
    }
  }

  async createFieldWorker(input: CreateFieldWorkerInput, tx?: Prisma.TransactionClient): Promise<Employee> {
    const { worker, created } = await this.findByNameOrCreate(input.tenant_id, input, tx);
    if (!created) return worker; // idempotent — لا نقول إنه أُضيف وهو موجود بالفعل
    return worker;
  }

  /**
   * تسجيل حضور عامل ميداني مع دعم HALF_DAY والأفرتايم.
   * في حالة حدوث تعارض (سجل في نفس اليوم) نحدث السجل بدلاً من إلقاء خطأ.
   */
  async recordAttendance(
    data: {
      employee_id: string;
      date: Date;
      status: AttendanceStatus;
      overtime_hours?: number;
      notes?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.attendanceRecord.upsert({
      where: {
        employee_id_date: { employee_id: data.employee_id, date: data.date },
      },
      update: {
        status: data.status,
        overtime_hours: data.overtime_hours ?? 0,
        notes: data.notes ?? null,
      },
      create: {
        employee_id: data.employee_id,
        date: data.date,
        status: data.status,
        overtime_hours: data.overtime_hours ?? 0,
        notes: data.notes ?? null,
      },
    });
  }

  async addTransaction(
    data: {
      employee_id: string;
      type: EmployeeTxType;
      amount: number;
      notes?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    if (data.amount < 0) {
      throw new Error('مبلغ معاملة الموظف لا يمكن أن يكون سالباً');
    }
    return client.employeeTransaction.create({
      data: {
        employee_id: data.employee_id,
        type: data.type,
        amount: data.amount,
        notes: data.notes ?? null,
      },
    });
  }
}
