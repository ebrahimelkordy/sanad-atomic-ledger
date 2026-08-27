import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { QueueModule } from './queues/queue.module';
import { RepositoriesModule } from './repositories/repositories.module';
import { ServicesModule } from './services/services.module';
import { WhatsappGatewayModule } from './whatsapp-gateway/whatsapp-gateway.module';
import { ControllersModule } from './controllers/controllers.module';
import { AuthModule } from './auth/auth.module';

import { OutboxProcessorJob } from './jobs/outbox-processor.job';
import { OverdueInvoicesJob } from './jobs/overdue-invoices.job';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    RepositoriesModule,
    AuthModule,
    ServicesModule,
    QueueModule,
    WhatsappGatewayModule,
    ControllersModule,
  ],
  providers: [OutboxProcessorJob, OverdueInvoicesJob],
  exports: [RepositoriesModule, AuthModule, ServicesModule],
})
export class AppModule {}
