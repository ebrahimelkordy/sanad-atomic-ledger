import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { TenantOnboardingService } from '../services/tenant-onboarding.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tenantOnboarding: TenantOnboardingService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body('name') name: string, @Body('password') password: string) {
    return this.authService.login(name, password);
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
    return result;
  }
}
