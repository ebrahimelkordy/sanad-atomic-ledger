import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import {
  incomingMessageQueueConfig,
  outgoingMessageQueueConfig,
} from './queue.config';
import { IncomingMessageProcessor } from './incoming-message.processor';

// فحص تفعيل الطوابير (BullMQ يتطلب Redis 5.0+ لإنشاء Lua Scripts)
const useQueue = process.env.ENABLE_QUEUE === 'true' || process.env.REDIS_URL;

const mockQueueProvider = {
  provide: 'BullQueue_incoming-messages',
  useValue: { add: async () => {} },
};

const mockOutgoingQueueProvider = {
  provide: 'BullQueue_outgoing-messages',
  useValue: { add: async () => {} },
};

@Module({
  imports: useQueue
    ? [
        ConfigModule,
        BullModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const redisUrl = config.get<string>('REDIS_URL');
            if (redisUrl) {
              return {
                connection: {
                  url: redisUrl,
                  tls: redisUrl.startsWith('rediss://') ? {} : undefined,
                },
              };
            }
            return {
              connection: {
                host: config.get<string>('REDIS_HOST', 'localhost'),
                port: Number(config.get<string | number>('REDIS_PORT', 6379)),
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
                skipVersionCheck: true,
              },
            };
          },
        }),
        BullModule.registerQueue(
          incomingMessageQueueConfig,
          outgoingMessageQueueConfig,
        ),
      ]
    : [ConfigModule],
  providers: useQueue ? [IncomingMessageProcessor] : [mockQueueProvider, mockOutgoingQueueProvider],
  exports: useQueue ? [BullModule] : ['BullQueue_incoming-messages', 'BullQueue_outgoing-messages'],
})
export class QueueModule {}
