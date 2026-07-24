import { Module } from '@nestjs/common';
import { BaileysSessionManagerService } from './baileys-session-manager.service';
import { BaileysGatewayService } from './baileys-gateway.service';
import { SessionRepositoryAdapter } from './session.repository-adapter';
import { RepositoriesModule } from '../repositories/repositories.module';
import { QueueModule } from '../queues/queue.module';

@Module({
  imports: [RepositoriesModule, QueueModule],
  providers: [
    BaileysSessionManagerService,
    BaileysGatewayService,
    SessionRepositoryAdapter,
  ],
  exports: [BaileysGatewayService, BaileysSessionManagerService],
})
export class WhatsappGatewayModule {}
