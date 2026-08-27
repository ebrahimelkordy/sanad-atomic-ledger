import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Req, Get, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission, PermissionGuard } from '../guards/permission.guard';
import { AuthService } from '../auth/auth.service';
import { TenantOnboardingService } from '../services/tenant-onboarding.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request.interface';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tenantOnboarding: TenantOnboardingService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body('email') email?: string,
    @Body('name') name?: string,
    @Body('password') password?: string,
    @Req() req?: any,
  ) {
    const identifier = email || name || '';
    const ip = req?.ip || req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || undefined;
    const userAgent = req?.headers?.['user-agent'];
    const traceId = (req as any)?.traceId;
    return this.authService.login(identifier, password || '', { ip, userAgent, traceId });
  }

  @Post('register')
  async register(
    @Body('businessName') businessName: string,
    @Body('verticalType') verticalType: string,
    @Body('whatsappNumber') whatsappNumber: string,
    @Body('numberRole') numberRole: string = 'PUBLIC_SALES',
    @Body('password') password?: string,
  ) {
    const result = await this.tenantOnboarding.onboardTenant(
      businessName,
      verticalType as any,
      whatsappNumber,
      numberRole as any,
      password,
    );
    // Bootstrap default roles/permissions for newly created tenant
    if (result?.id) await this.authService.bootstrapRolesForTenant(result.id);
    return result;
  }

  /* ===================== RBAC — Users Management ===================== */

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission({ resource: 'user', action: 'create' })
  @Post('users')
  async createUser(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.authService.createTenantUser(req.principal, body);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission({ resource: 'user', action: 'read' })
  @Get('users')
  async listUsers(@Req() req: AuthenticatedRequest) {
    return this.authService.listUsers(req.principal);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission({ resource: 'user', action: 'update' })
  @Post('users/status')
  async setUserStatus(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.authService.setUserStatus(req.principal, body);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission({ resource: 'user.role', action: 'assign' })
  @Post('users/roles/assign')
  async assignRole(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.authService.assignRole(req.principal, body);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission({ resource: 'user.role', action: 'revoke' })
  @Post('users/roles/unassign')
  async unassignRole(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.authService.unassignRole(req.principal, body);
  }

  /* ======== Roles bootstrap endpoint (for migrations / owner only) ======== */
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission({ resource: 'role', action: 'bootstrap' })
  @Post('roles/bootstrap')
  async bootstrapRoles(@Req() req: AuthenticatedRequest) {
    return this.authService.bootstrapRolesForTenant(req.principal.tenantId);
  }
}
