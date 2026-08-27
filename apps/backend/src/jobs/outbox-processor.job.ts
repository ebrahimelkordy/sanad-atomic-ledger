import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../repositories/prisma.service';
import { BaileysGatewayService } from '../whatsapp-gateway/baileys-gateway.service';

/**
 * Sprint 2A — Task 2.1: Outbox Processor Job
 *
 * Scans `outbox_messages` table every 10 seconds for messages with status `PENDING`
 * or scheduled for processing (`process_after <= NOW()`).
 * Dispatches WhatsApp / Notification messages through BaileysGatewayService and
 * updates status to `SENT` or `FAILED` with exponential retry backoff.
 */
@Injectable()
export class OutboxProcessorJob {
  private readonly logger = new Logger(OutboxProcessorJob.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly baileysGateway: BaileysGatewayService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleOutboxQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date();
      const pendingMessages = await this.prisma.outboxMessage.findMany({
        where: {
          status: 'PENDING',
          OR: [
            { process_after: null },
            { process_after: { lte: now } },
          ],
          attempts: { lt: 5 }, // max 5 retry attempts
        },
        orderBy: [
          { priority: 'desc' },
          { created_at: 'asc' },
        ],
        take: 20,
      });

      if (pendingMessages.length === 0) {
        this.isProcessing = false;
        return;
      }

      this.logger.log(`Outbox Processor: handling ${pendingMessages.length} pending message(s)...`);

      for (const message of pendingMessages) {
        await this.processSingleMessage(message);
      }
    } catch (err) {
      this.logger.error('Outbox Processor encountered an unhandled error', (err as Error).stack);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processSingleMessage(message: any): Promise<void> {
    // Mark message as PROCESSING
    await this.prisma.outboxMessage.update({
      where: { id: message.id },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
      },
    });

    try {
      const payload = message.payload as { recipientWhatsapp?: string; to?: string; text?: string; messageContent?: string; body?: string };
      const recipient = payload.recipientWhatsapp || payload.to;
      const textContent = payload.messageContent || payload.text || payload.body;

      if (!recipient || !textContent) {
        throw new Error(`Invalid outbox payload format: missing recipient or text content`);
      }

      if (message.message_type.startsWith('WHATSAPP')) {
        await this.baileysGateway.sendOutgoingMessage({
          tenantId: message.tenant_id,
          recipientWhatsapp: recipient,
          messageContent: textContent,
        });
      }

      // Mark as SENT
      await this.prisma.outboxMessage.update({
        where: { id: message.id },
        data: {
          status: 'SENT',
          sent_at: new Date(),
          last_error: null,
        },
      });

      this.logger.log(`Outbox message ${message.id} sent successfully to ${recipient}`);
    } catch (err) {
      const errorMsg = (err as Error).message || String(err);
      const isDead = message.attempts >= 4; // Will be 5 after current increment
      const nextDelayMs = Math.pow(2, message.attempts) * 10000; // Exponential backoff: 20s, 40s, 80s...

      await this.prisma.outboxMessage.update({
        where: { id: message.id },
        data: {
          status: isDead ? 'DEAD' : 'PENDING',
          last_error: errorMsg,
          process_after: isDead ? undefined : new Date(Date.now() + nextDelayMs),
        },
      });

      this.logger.warn(`Outbox message ${message.id} failed (attempt ${message.attempts + 1}): ${errorMsg}`);
    }
  }
}
