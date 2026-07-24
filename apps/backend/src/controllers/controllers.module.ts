import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ServicesModule } from '../services/services.module';
import { AuthController } from './auth.controller';
import { TenantController } from './tenant.controller';
import { OrderController } from './order.controller';
import { FinanceController } from './finance.controller';

@Module({
  imports: [AuthModule, ServicesModule],
  controllers: [
    AuthController,
    TenantController,
    OrderController,
    FinanceController,
  ],
})
export class ControllersModule {}
