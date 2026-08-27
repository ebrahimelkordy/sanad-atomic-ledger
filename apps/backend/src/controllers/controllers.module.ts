import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ServicesModule } from '../services/services.module';
import { AuthController } from './auth.controller';
import { TenantController } from './tenant.controller';
import { OrderController } from './order.controller';
import { FinanceController } from './finance.controller';
import { InventoryController } from './inventory.controller';
import { SalesController } from './sales.controller';
import { EmployeeController } from './employee.controller';
import { CustomerController } from './customer.controller';
import { ChatController } from './chat.controller';

import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

import { WhatsappGatewayModule } from '../whatsapp-gateway/whatsapp-gateway.module';

@Module({
  imports: [AuthModule, ServicesModule, TerminusModule, WhatsappGatewayModule],
  controllers: [
    AuthController,
    TenantController,
    OrderController,
    FinanceController,
    InventoryController,
    SalesController,
    EmployeeController,
    CustomerController,
    ChatController,
    HealthController,
  ],
})
export class ControllersModule {}
