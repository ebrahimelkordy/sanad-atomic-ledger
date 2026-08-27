import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, RequirePermission } from '../guards/permission.guard';
import { EmployeeService } from '../services/employee.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request.interface';
import { AttendanceStatus, EmployeeTxType, SalaryType } from '@prisma/client';

@Controller('employees')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get()
  @RequirePermission({ resource: 'payroll', action: 'read' })
  async getEmployees(@Req() req: AuthenticatedRequest) {
    const tenantId = req.principal.tenantId;
    return this.employeeService.getEmployees(tenantId);
  }

  @Get(':id')
  @RequirePermission({ resource: 'payroll', action: 'read' })
  async getEmployeeById(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tenantId = req.principal.tenantId;
    return this.employeeService.getEmployeeById(tenantId, id);
  }

  @Post()
  @RequirePermission({ resource: 'payroll', action: 'write' })
  async createEmployee(
    @Req() req: AuthenticatedRequest,
    @Body('name') name: string,
    @Body('phone') phone: string,
    @Body('job_title') job_title: string,
    @Body('salary_type') salary_type: SalaryType,
    @Body('base_rate') base_rate: number,
    @Body('auto_attendance') auto_attendance: boolean,
  ) {
    const tenantId = req.principal.tenantId;
    const res = await this.employeeService.createEmployee(tenantId, {
      name, phone, job_title, salary_type, base_rate, auto_attendance: auto_attendance ?? true,
    });
    return { ...res.employee, created: res.created };
  }

  @Post(':id/attendance')
  @RequirePermission({ resource: 'payroll', action: 'write' })
  async recordAttendance(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body('date') date: string,
    @Body('status') status: AttendanceStatus,
    @Body('overtime_hours') overtime_hours: number,
    @Body('notes') notes: string,
  ) {
    const tenantId = req.principal.tenantId;
    return this.employeeService.recordAttendance(tenantId, id, { date, status, overtime_hours, notes });
  }

  @Post(':id/transactions')
  @RequirePermission({ resource: 'payroll', action: 'write' })
  async addTransaction(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body('type') type: EmployeeTxType,
    @Body('amount') amount: number,
    @Body('notes') notes: string,
  ) {
    const tenantId = req.principal.tenantId;
    return this.employeeService.addTransaction(tenantId, id, { type, amount, notes });
  }

  @Post(':id/rate')
  @RequirePermission({ resource: 'payroll', action: 'write' })
  async updateRate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body('new_rate') new_rate: number,
    @Body('change_reason') change_reason: any,
    @Body('salary_type') salary_type: SalaryType,
    @Body('notes') notes: string,
    @Body('effective_date') effective_date: string,
  ) {
    const tenantId = req.principal.tenantId;
    return this.employeeService.updateRateWithHistory(tenantId, id, {
      new_rate, change_reason, salary_type, notes, effective_date, applied_by: req.principal.userId,
    });
  }

  @Get(':id/rate-history')
  @RequirePermission({ resource: 'report.financial', action: 'read' })
  async getRateHistory(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tenantId = req.principal.tenantId;
    return this.employeeService.getRateHistory(tenantId, id);
  }

  /* ============= Payroll run ============= */
  @Post('run-payroll')
  @RequirePermission({ resource: 'payroll', action: 'run' })
  async runMonthlyPayroll(
    @Req() req: AuthenticatedRequest,
    @Body('month') runForYYYYMM: string, // e.g. "2026-08"
  ) {
    const tenantId = req.principal.tenantId;
    // NOTE: runMonthlyPayroll will be available after implementing Step 6
    const fn = (this.employeeService as any).runMonthlyPayroll;
    if (typeof fn !== 'function') {
      throw new (require('@nestjs/common').NotImplementedException)('Payroll execution module will be released with Step 6 of the excellence plan');
    }
    return fn.call(this.employeeService, tenantId, runForYYYYMM, req.principal.userId);
  }
}
