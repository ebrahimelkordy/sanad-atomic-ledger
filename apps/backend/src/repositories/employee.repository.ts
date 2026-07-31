/**
 * القاعدة #2: STRICT DOMAIN & ROLE SEPARATION
 * EmployeeRepository = خاص بالموظفين الإداريين المكتبيين فقط.
 *
 * لا يُستخدم هذا الملف لإدارة الفنيين الميدانيين.
 *   - افتراضي: MONTHLY (شهري)
 *   - الوظائف عادة محاسبة / موارد بشرية / استعلامات مكتبية
 *   - العامل الميداني يجب أن يذهب لـ FieldWorkerRepository
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Employee, AttendanceStatus, SalaryType, EmployeeTxType, Prisma } from '@prisma/client';
import {
  OfficeEmployeeSchema,
  ValidatedOfficeEmployeePayload,
  generateSafePhone,
  validatePhoneOrNull,
  classifyDomainRole,
} from '../validation';

export type CreateEmployeeInput = ValidatedOfficeEmployeePayload & {
  tenant_id: string;
};

@Injectable()
export class EmployeeRepository {
  constructor(private readonly prisma: PrismaService) {}

  private static normalize(input: CreateEmployeeInput) {
    // القاعدة #2: منع استخدام الموظف الإداري لكيان يبدو عاملاً ميدانياً.
    const inferred = classifyDomainRole({
      name: input.name,
      jobTitle: input.job_title,
    });
    if (inferred === 'FIELD_WORKER') {
      throw new Error(
        `VIOLATION_DOMAIN_SEPARATION: الكيان "${input.name}" يبدو عاملاً ميدانياً. استخدم FieldWorkerRepository بدلاً من EmployeeRepository.`,
      );
    }

    const validated = OfficeEmployeeSchema.parse(input);

    // القاعدة #1: هاتف آمن وليس null/false.
    let phone = validatePhoneOrNull(validated.phone);
    if (!phone) {
      phone = generateSafePhone('OFF-' + validated.name);
    }

    const salaryType: SalaryType = (validated.salary_type as SalaryType) || 'MONTHLY';

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

  async findByName(
    tenantId: string,
    name: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Employee | null> {
    const client = tx ?? this.prisma;
    return client.employee.findFirst({
      where: { tenant_id: tenantId, name: { equals: name, mode: 'insensitive' } },
    });
  }

  async createEmployee(
    data: CreateEmployeeInput,
    tx?: Prisma.TransactionClient,
  ): Promise<{ employee: Employee; created: boolean }> {
    const client = tx ?? this.prisma;
    const normalized = EmployeeRepository.normalize(data);

    const existing = await this.findByName(data.tenant_id, normalized.name, tx);
    if (existing) return { employee: existing, created: false };

    try {
      const created = await client.employee.create({ data: normalized });
      return { employee: created, created: true };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const safePhone = generateSafePhone('OFF-' + normalized.name + Date.now().toString());
        const fallback = await client.employee.create({
          data: { ...normalized, phone: safePhone },
        });
        return { employee: fallback, created: true };
      }
      throw e;
    }
  }

  async updateEmployee(
    id: string,
    data: Partial<CreateEmployeeInput>,
    tx?: Prisma.TransactionClient,
  ): Promise<Employee> {
    const client = tx ?? this.prisma;
    const partial: Record<string, unknown> = {};
    if (data.name !== undefined) partial.name = data.name;
    if (data.phone !== undefined) {
      const p = validatePhoneOrNull(data.phone);
      partial.phone = p || generateSafePhone('OFF-' + String(data.name || 'UPD'));
    }
    if (data.job_title !== undefined) partial.job_title = data.job_title;
    if (data.salary_type !== undefined) partial.salary_type = data.salary_type;
    if (data.base_rate !== undefined) partial.base_rate = data.base_rate;
    if (data.auto_attendance !== undefined) partial.auto_attendance = data.auto_attendance;
    return client.employee.update({ where: { id }, data: partial as any });
  }

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
      where: { employee_id_date: { employee_id: data.employee_id, date: data.date } },
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
    if (data.amount < 0) throw new Error('مبلغ معاملة الموظف الإداري غير صالح');
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
