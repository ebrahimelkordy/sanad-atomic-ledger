import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../repositories/prisma.service';

/**
 * Sprint 3B — Task 3.4: Overdue Invoices Reminder Job
 *
 * Runs daily at 10:00 AM to check for confirmed credit sales past their due_date.
 * Enqueues a notification outbox message for customer follow-up and updates reminder metrics.
 */
@Injectable()
export class OverdueInvoicesJob {
  private readonly logger = new Logger(OverdueInvoicesJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_10AM, { name: 'overdue-invoices-reminder' })
  async handleOverdueInvoices(): Promise<void> {
    const today = new Date();
    this.logger.log('Running daily overdue invoices check...');

    const overdueSales = await this.prisma.sale.findMany({
      where: {
        status: 'CONFIRMED',
        sale_type: 'CREDIT',
        due_date: { lt: today },
        remaining_amount: { gt: 0 },
      },
      include: {
        customer: true,
      },
    });

    if (overdueSales.length === 0) {
      this.logger.log('No overdue invoices found today.');
      return;
    }

    this.logger.log(`Found ${overdueSales.length} overdue invoice(s). Creating outbox notifications...`);

    for (const sale of overdueSales) {
      const recipient = sale.customer?.whatsapp || sale.customer?.phone || sale.customer_identifier;
      if (!recipient) continue;

      const bodyText = `تذكير: الفاتورة رقم #${sale.invoice_number} بمبلغ ${sale.remaining_amount} ج.م استُحقت بتاريخ ${sale.due_date?.toLocaleDateString('ar-EG')}. برجاء المتابعة والسداد.`;

      // Enqueue to OutboxMessage table
      await this.prisma.outboxMessage.create({
        data: {
          tenant_id: sale.tenant_id,
          message_type: 'WHATSAPP_TEXT',
          payload: {
            recipientWhatsapp: recipient,
            messageContent: bodyText,
          },
          priority: 1, // high priority
        },
      });

      // Update sale reminder stats
      await this.prisma.sale.update({
        where: { id: sale.id },
        data: {
          reminder_count: { increment: 1 },
          last_reminder_at: new Date(),
        },
      });
    }

    this.logger.log(`✅ Overdue invoice reminders created for ${overdueSales.length} sale(s).`);
  }
}
