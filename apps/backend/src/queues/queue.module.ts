import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import {
  incomingMessageQueueConfig,
  outgoingMessageQueueConfig,
} from './queue.config';
import { IncomingMessageProcessor } from './incoming-message.processor';

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('REDIS_HOST', '127.0.0.1');
        const port = config.get<number>('REDIS_PORT', 6379);
        return {
          connection: {
            host,
            port,
            skipVersionCheck: true,
          },
        };
      },
    }),
    BullModule.registerQueue(
      incomingMessageQueueConfig,
      outgoingMessageQueueConfig,
    ),
  ],
  providers: [IncomingMessageProcessor],
  exports: [BullModule],
})
export class QueueModule {}
