import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Employee, AttendanceStatus, SalaryType, EmployeeTxType } from '@prisma/client';

export type CreateEmployeeInput = {
  tenant_id: string;
  name: string;
  phone?: string;
  job_title?: string;
  salary_type: SalaryType;
  base_rate: number;
  auto_attendance: boolean;
};

@Injectable()
export class EmployeeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenantId(tenantId: string): Promise<Employee[]> {
    return this.prisma.employee.findMany({
      where: { tenant_id: tenantId },
      include: {
        attendances: true,
        transactions: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findById(tenantId: string, id: string): Promise<Employee | null> {
    return this.prisma.employee.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        attendances: {
          orderBy: { date: 'desc' },
        },
        transactions: {
          orderBy: { created_at: 'desc' },
        },
      },
    });
  }

  async createEmployee(data: CreateEmployeeInput): Promise<Employee> {
    return this.prisma.employee.create({
      data: {
        tenant_id: data.tenant_id,
        name: data.name,
        phone: data.phone,
        job_title: data.job_title,
        salary_type: data.salary_type,
        base_rate: data.base_rate,
        auto_attendance: data.auto_attendance,
      },
    });
  }

  async updateEmployee(id: string, data: Partial<CreateEmployeeInput>): Promise<Employee> {
    return this.prisma.employee.update({
      where: { id },
      data,
    });
  }

  async recordAttendance(data: {
    employee_id: string;
    date: Date;
    status: AttendanceStatus;
    overtime_hours?: number;
    notes?: string;
  }) {
    return this.prisma.attendanceRecord.upsert({
      where: {
        employee_id_date: {
          employee_id: data.employee_id,
          date: data.date,
        },
      },
      update: {
        status: data.status,
        overtime_hours: data.overtime_hours ?? 0,
        notes: data.notes,
      },
      create: {
        employee_id: data.employee_id,
        date: data.date,
        status: data.status,
        overtime_hours: data.overtime_hours ?? 0,
        notes: data.notes,
      },
    });
  }

  async addTransaction(data: {
    employee_id: string;
    type: EmployeeTxType;
    amount: number;
    notes?: string;
  }) {
    return this.prisma.employeeTransaction.create({
      data,
    });
  }
}
