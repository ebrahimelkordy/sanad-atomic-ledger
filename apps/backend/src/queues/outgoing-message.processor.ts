import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BaileysGatewayService } from '../whatsapp-gateway/baileys-gateway.service';

export type OutgoingMessageJobPayload = {
  tenantId: string;
  recipientWhatsapp: string;
  messageContent: string;
};

@Processor('outgoing-messages')
@Injectable()
export class OutgoingMessageProcessor extends WorkerHost {
  private readonly logger = new Logger(OutgoingMessageProcessor.name);

  constructor(private readonly baileysGatewayService: BaileysGatewayService) {
    super();
  }

  async process(job: Job<OutgoingMessageJobPayload>): Promise<void> {
    this.logger.log(
      `Sending outgoing WhatsApp message for tenant=${job.data.tenantId} recipient=${job.data.recipientWhatsapp}`,
    );

    await this.baileysGatewayService.sendOutgoingMessage(job.data);
  }
}
