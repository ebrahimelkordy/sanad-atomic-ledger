import { Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeRepository, CreateEmployeeInput } from '../repositories/employee.repository';
import { AttendanceStatus, EmployeeTxType } from '@prisma/client';

@Injectable()
export class EmployeeService {
  constructor(private readonly employeeRepository: EmployeeRepository) {}

  async getEmployees(tenantId: string) {
    const employees = await this.employeeRepository.findByTenantId(tenantId);
    return employees.map((emp) => this.calculateEmployeeSummary(emp));
  }

  async getEmployeeById(tenantId: string, id: string) {
    const emp = await this.employeeRepository.findById(tenantId, id);
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    return this.calculateEmployeeSummary(emp);
  }

  async createEmployee(tenantId: string, dto: Omit<CreateEmployeeInput, 'tenant_id'>) {
    const { employee, created } = await this.employeeRepository.createEmployee({
      tenant_id: tenantId,
      ...dto,
    });
    return { employee, created };
  }

  async recordAttendance(
    tenantId: string,
    id: string,
    dto: { date: string; status: AttendanceStatus; overtime_hours?: number; notes?: string },
  ) {
    await this.getEmployeeById(tenantId, id);
    return this.employeeRepository.recordAttendance({
      employee_id: id,
      date: new Date(dto.date),
      status: dto.status,
      overtime_hours: dto.overtime_hours,
      notes: dto.notes,
    });
  }

  async addTransaction(
    tenantId: string,
    id: string,
    dto: { type: EmployeeTxType; amount: number; notes?: string },
  ) {
    await this.getEmployeeById(tenantId, id);
    return this.employeeRepository.addTransaction({
      employee_id: id,
      type: dto.type,
      amount: dto.amount,
      notes: dto.notes,
    });
  }

  async updateRateWithHistory(
    tenantId: string,
    id: string,
    dto: {
      new_rate: number;
      change_reason: any;
      salary_type?: any;
      notes?: string;
      effective_date?: string;
      applied_by?: string;
    },
  ) {
    await this.getEmployeeById(tenantId, id);
    return this.employeeRepository.updateRateWithHistory({
      employeeId: id,
      newRate: dto.new_rate,
      changeReason: dto.change_reason,
      salaryType: dto.salary_type,
      notes: dto.notes,
      effectiveDate: dto.effective_date ? new Date(dto.effective_date) : undefined,
      appliedBy: dto.applied_by,
    });
  }

  async getRateHistory(tenantId: string, id: string) {
    await this.getEmployeeById(tenantId, id);
    return this.employeeRepository.getRateHistory(id);
  }

  /**
   * حساب الحضور الذاتي والرواتب والسلفيات الصافية
   */
  private calculateEmployeeSummary(employee: any) {
    const baseRate = Number(employee.base_rate || 0);
    const isDaily = employee.salary_type === 'DAILY';

    // أيام الشهر الحالي حتى اليوم
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const dayOfMonth = now.getDate();

    // السجلات المدخلة يدوياً للموظف
    const attendancesMap = new Map<string, any>();
    (employee.attendances || []).forEach((att: any) => {
      const dateStr = new Date(att.date).toISOString().slice(0, 10);
      attendancesMap.set(dateStr, att);
    });

    let presentDaysCount = 0;
    let absentDaysCount = 0;
    let totalOvertimeHours = 0;

    // حساب الحضور (إذا كان auto_attendance = true يفترض الحضور لكل يوم ما لم يوجد سجل استثناء)
    for (let day = 1; day <= dayOfMonth; day++) {
      const d = new Date(currentYear, currentMonth, day);
      const dateKey = d.toISOString().slice(0, 10);

      if (attendancesMap.has(dateKey)) {
        const record = attendancesMap.get(dateKey);
        if (record.status === 'PRESENT') presentDaysCount += 1;
        else if (record.status === 'HALF_DAY') presentDaysCount += 0.5;
        else if (record.status === 'ABSENT') absentDaysCount += 1;

        totalOvertimeHours += Number(record.overtime_hours || 0);
      } else {
        // لا يوجد سجل صريح
        if (employee.auto_attendance) {
          presentDaysCount += 1; // حضور افتراضي تلقائي
        }
      }
    }

    // حساب السلف والخصومات والمكافآت
    let totalAdvances = 0;
    let totalDeductions = 0;
    let totalBonuses = 0;
    let totalPaid = 0;

    (employee.transactions || []).forEach((tx: any) => {
      const amt = Number(tx.amount || 0);
      if (tx.type === 'ADVANCE') totalAdvances += amt;
      else if (tx.type === 'DEDUCTION') totalDeductions += amt;
      else if (tx.type === 'BONUS') totalBonuses += amt;
      else if (tx.type === 'PAYROLL_PAYMENT') totalPaid += amt;
    });

    // المستحق الإجمالي
    const hourlyRate = isDaily ? baseRate / 8 : baseRate / 30 / 8;
    const overtimePay = totalOvertimeHours * hourlyRate * 1.5;

    let earnedSalary = 0;
    if (isDaily) {
      earnedSalary = presentDaysCount * baseRate;
    } else {
      // شهري: خصم أجزاء الغياب غير المبرر
      const dailyRate = baseRate / 30;
      earnedSalary = baseRate - absentDaysCount * dailyRate;
    }

    const netSalaryDue = earnedSalary + overtimePay + totalBonuses - totalAdvances - totalDeductions - totalPaid;

    return {
      ...employee,
      summary: {
        present_days: presentDaysCount,
        absent_days: absentDaysCount,
        overtime_hours: totalOvertimeHours,
        earned_salary: earnedSalary,
        overtime_pay: overtimePay,
        total_advances: totalAdvances,
        total_deductions: totalDeductions,
        total_bonuses: totalBonuses,
        total_paid: totalPaid,
        net_salary_due: Math.max(0, netSalaryDue),
      },
    };
  }
}
