import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BaileysSessionManagerService,
  BaileysSessionConfig,
} from './baileys-session-manager.service';

export type IncomingMessageJobPayload = {
  whatsappMessageId: string;
  phoneNumberReceiving: string;
  customerWhatsapp: string;
  messageText: string;
  timestamp: string | number | Date;
};

export type OutgoingMessageJobPayload = {
  tenantId: string;
  recipientWhatsapp: string;
  messageContent: string;
};

@Injectable()
export class BaileysGatewayService {
  private readonly logger = new Logger(BaileysGatewayService.name);

  constructor(
    private readonly sessionManager: BaileysSessionManagerService,
    @InjectQueue('incoming-messages')
    private readonly incomingQueue: Queue<IncomingMessageJobPayload>,
  ) {}

  private readonly registeredListeners = new Set<string>();

  async registerNumber(config: BaileysSessionConfig): Promise<void> {
    const session = await this.sessionManager.registerSession(config);

    if (this.registeredListeners.has(config.phoneNumber)) {
      return;
    }

    this.registeredListeners.add(config.phoneNumber);

    session.socket.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;

      for (const msg of m.messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const remoteJid = msg.key.remoteJid;
        if (
          !remoteJid ||
          remoteJid.endsWith('@g.us') ||
          remoteJid === 'status@broadcast'
        )
          continue;

        const messageText =
          msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!messageText) continue;

        const customerWhatsapp = remoteJid.replace('@s.whatsapp.net', '');
        const whatsappMessageId = msg.key.id;

        if (!whatsappMessageId) continue;

        let timestamp = Date.now();
        if (msg.messageTimestamp) {
          timestamp =
            typeof msg.messageTimestamp === 'number'
              ? msg.messageTimestamp * 1000
              : Number(msg.messageTimestamp) * 1000;
        }

        await this.enqueueIncomingMessage({
          whatsappMessageId,
          phoneNumberReceiving: config.phoneNumber,
          customerWhatsapp,
          messageText,
          timestamp,
        });
      }
    });
  }

  async enqueueIncomingMessage(
    payload: IncomingMessageJobPayload,
  ): Promise<Job<IncomingMessageJobPayload>> {
    this.logger.log(
      `Enqueuing incoming WhatsApp message ${payload.whatsappMessageId} for tenant recipient=${payload.customerWhatsapp}`,
    );
    return this.incomingQueue.add(payload.whatsappMessageId, payload, {
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  async sendOutgoingMessage(payload: OutgoingMessageJobPayload): Promise<void> {
    const session = this.sessionManager.getSessionByTenant(payload.tenantId);
    if (!session) {
      throw new Error(
        `No WhatsApp session available for tenant ${payload.tenantId}`,
      );
    }

    await session.socket.sendMessage(
      payload.recipientWhatsapp + '@s.whatsapp.net',
      {
        text: payload.messageContent,
      },
    );
  }
}
