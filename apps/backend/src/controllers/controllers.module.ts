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

@Module({
  imports: [AuthModule, ServicesModule],
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
  ],
})
export class ControllersModule {}
