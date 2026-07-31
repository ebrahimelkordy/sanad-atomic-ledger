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
        // دعم Upstash Redis عبر REDIS_URL (rediss://) أو Redis محلي عبر REDIS_HOST + REDIS_PORT
        const redisUrl = config.get<string>('REDIS_URL');
        
        if (redisUrl) {
          // استخدام رابط Upstash مباشرة (rediss://...)
          return {
            connection: {
              url: redisUrl,
              tls: redisUrl.startsWith('rediss://') ? {} : undefined,
            },
          };
        }

// Redis محلي (docker-compose) — استخدام port 6380 عشان Redis 8.8.0 الجديد
        const host = config.get<string>('REDIS_HOST', 'localhost');
        const port = config.get<number>('REDIS_PORT', 6380);
        return {
          connection: {
            host,
            port,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
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
