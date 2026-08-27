import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../repositories/prisma.service';
import { IOutboxWriterPort, OutboxPayload } from '../../application/ports/i-outbox-writer.port';

@Injectable()
export class PrismaOutboxWriterAdapter implements IOutboxWriterPort {
  constructor(private readonly prisma: PrismaService) {}

  async enqueueWhatsAppText(tenantId: string, payload: OutboxPayload): Promise<string> {
    const row = await this.prisma.outboxMessage.create({
      data: {
        tenant_id: tenantId,
        message_type: 'WHATSAPP_TEXT',
        payload: { to: payload.to, body: payload.body } as any,
        priority: payload.priority ?? 0,
        correlation_id: payload.correlation_id ?? null,
        status: 'PENDING',
      },
      select: { id: true },
    });
    return row.id;
  }
}