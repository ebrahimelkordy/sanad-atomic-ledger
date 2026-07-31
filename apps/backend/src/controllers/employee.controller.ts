import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmployeeService } from '../services/employee.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request.interface';
import { AttendanceStatus, EmployeeTxType, SalaryType } from '@prisma/client';

@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get()
  async getEmployees(@Req() req: AuthenticatedRequest) {
    const tenantId = req.user.tenant_id;
    return this.employeeService.getEmployees(tenantId);
  }

  @Get(':id')
  async getEmployeeById(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tenantId = req.user.tenant_id;
    return this.employeeService.getEmployeeById(tenantId, id);
  }

  @Post()
  async createEmployee(
    @Req() req: AuthenticatedRequest,
    @Body('name') name: string,
    @Body('phone') phone: string,
    @Body('job_title') job_title: string,
    @Body('salary_type') salary_type: SalaryType,
    @Body('base_rate') base_rate: number,
    @Body('auto_attendance') auto_attendance: boolean,
  ) {
    const tenantId = req.user.tenant_id;
    return this.employeeService.createEmployee(tenantId, {
      name,
      phone,
      job_title,
      salary_type,
      base_rate,
      auto_attendance: auto_attendance ?? true,
    });
  }

  @Post(':id/attendance')
  async recordAttendance(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body('date') date: string,
    @Body('status') status: AttendanceStatus,
    @Body('overtime_hours') overtime_hours: number,
    @Body('notes') notes: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.employeeService.recordAttendance(tenantId, id, {
      date,
      status,
      overtime_hours,
      notes,
    });
  }

  @Post(':id/transactions')
  async addTransaction(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body('type') type: EmployeeTxType,
    @Body('amount') amount: number,
    @Body('notes') notes: string,
  ) {
    const tenantId = req.user.tenant_id;
    return this.employeeService.addTransaction(tenantId, id, {
      type,
      amount,
      notes,
    });
  }
}
