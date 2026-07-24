import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { QueueModule } from './queues/queue.module';
import { RepositoriesModule } from './repositories/repositories.module';
import { TenantGuard } from './guards/tenant.guard';
import { FinanceRoleGuard } from './guards/finance-role.guard';
import { ServicesModule } from './services/services.module';
import { WhatsappGatewayModule } from './whatsapp-gateway/whatsapp-gateway.module';
import { ControllersModule } from './controllers/controllers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    RepositoriesModule,
    ServicesModule,
    QueueModule,
    WhatsappGatewayModule,
    ControllersModule,
  ],
  providers: [TenantGuard, FinanceRoleGuard],
  exports: [RepositoriesModule, ServicesModule, TenantGuard, FinanceRoleGuard],
})
export class AppModule {}
