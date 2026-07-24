import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { TenantResolutionService } from '../services/tenant-resolution.service';
import { TenantRepository } from '../repositories/tenant.repository';
import { AIOrchestrationService } from '../services/ai-orchestration.service';
import {
  OrderProcessorService,
  ExtractedOrderItem,
} from '../services/order-processor.service';
import { SettlementService } from '../services/settlement.service';
import { PendingSettlementRepository } from '../repositories/pending-settlement.repository';
import { UnregisteredNumberException } from '../services/unregistered-number.exception';
import { LedgerEntryType } from '@prisma/client';

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

/**
 * Step 06 — Incoming message processor.
 *
 * This is the orchestrator only. All business logic validation lives in the
 * respective services (OrderProcessorService, SettlementService). The processor
 * resolves tenant, classifies intent, delegates to services, and enqueues replies.
 */
@Processor('incoming-messages')
@Injectable()
export class IncomingMessageProcessor extends WorkerHost {
  private readonly logger = new Logger(IncomingMessageProcessor.name);

  constructor(
    private readonly tenantResolution: TenantResolutionService,
    private readonly tenantRepo: TenantRepository,
    private readonly aiOrchestrator: AIOrchestrationService,
    private readonly orderProcessor: OrderProcessorService,
    private readonly settlementService: SettlementService,
    private readonly pendingSettlementRepo: PendingSettlementRepository,
    @InjectQueue('outgoing-messages')
    private readonly outgoingQueue: Queue<OutgoingMessageJobPayload>,
  ) {
    super();
  }

  private async enqueueOutgoing(
    tenantId: string,
    recipientWhatsapp: string,
    messageContent: string,
  ): Promise<void> {
    await this.outgoingQueue.add(
      'response',
      { tenantId, recipientWhatsapp, messageContent },
      { removeOnComplete: true },
    );
  }

  async process(job: Job<IncomingMessageJobPayload>): Promise<void> {
    const {
      whatsappMessageId,
      phoneNumberReceiving,
      customerWhatsapp,
      messageText,
    } = job.data;

    // Step 5-7: Resolve tenant_id from phone number
    let resolvedTenant;
    try {
      resolvedTenant =
        await this.tenantResolution.resolveTenantFromPhoneNumber(
          phoneNumberReceiving,
        );
    } catch (e) {
      if (e instanceof UnregisteredNumberException) {
        this.logger.warn(
          `Drop message: unregistered number ${phoneNumberReceiving}`,
        );
        return; // Drop silently per step 09 spec
      }
      throw e;
    }

    const tenantId = resolvedTenant.tenant_id;
    const numberRole = resolvedTenant.number_role;

    // Step 3 (Parallel): Enqueue lightweight ACK immediately without awaiting
    this.outgoingQueue
      .add(
        'ack',
        {
          tenantId,
          recipientWhatsapp: customerWhatsapp,
          messageContent: 'جاري معالجة طلبك...',
        },
        { removeOnComplete: true },
      )
      .catch((err) => this.logger.error('Failed to enqueue ACK', err));

    // Get tenant for verticalType
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      this.logger.error(`Tenant not found for id ${tenantId}`);
      return;
    }

    // Step 10-14 (Settlement flow): Check if msg is a confirmation reply to active PendingSettlement
    if (numberRole === 'AUTHORIZED_FINANCE') {
      const confirmationResult =
        await this.settlementService.checkConfirmationReply(
          tenantId,
          customerWhatsapp,
          messageText,
        );
      if (confirmationResult.isConfirmation && confirmationResult.result) {
        const result = confirmationResult.result;
        let content: string;
        if (typeof result === 'string') {
          content = result;
        } else {
          content = `${result.confirmation_text}\nرقم القيد: ${result.ledger_entry_id}\nالرصيد المحدث: ${result.running_balance}`;
        }

        await this.outgoingQueue.add(
          'settlement-receipt',
          {
            tenantId,
            recipientWhatsapp: customerWhatsapp,
            messageContent: content,
          },
          { removeOnComplete: true },
        );
        return;
      }
    }

    // Step 9: Classify intent and extract data via AI (oracle)
    const aiResult = await this.aiOrchestrator.classifyAndExtract(messageText, {
      tenantId,
      verticalType: tenant.vertical_type,
    });

    // Step 9-alt: UNKNOWN intent
    if (aiResult.intent === 'UNKNOWN') {
      await this.enqueueOutgoing(
        tenantId,
        customerWhatsapp,
        'معرفتش أفهم طلبك.',
      );
      return;
    }

    // ======= ORDER FLOW (Step 09) =======
    if (aiResult.intent === 'ORDER') {
      const items =
        (aiResult.extractedData.items as Array<{
          productNameOrSku: string;
          quantity: number;
        }>) || [];
      const extractedItems: ExtractedOrderItem[] = items.map((i) => ({
        productNameOrSku: i.productNameOrSku,
        quantity: Number(i.quantity),
      }));

      // Delegate to OrderProcessorService (all validation + idempotency inside)
      const result = await this.orderProcessor.processOrder(
        tenantId,
        customerWhatsapp,
        extractedItems,
        whatsappMessageId,
        messageText,
      );

      // Build response message
      let messageContent = '';
      if ('invoice_text' in result) {
        messageContent =
          result.invoice_text +
          '\n' +
          result.order_details
            .map(
              (d) =>
                `- ${d.quantity_ordered}x (ID: ${d.product_id}) : ${d.unit_price_at_order} ج.م`,
            )
            .join('\n') +
          `\nالإجمالي: ${result.grand_total} ج.م`;
      } else if ('rejection_text' in result) {
        messageContent = result.rejection_text;
      }

      await this.enqueueOutgoing(tenantId, customerWhatsapp, messageContent);
      return;
    }

    // ======= SETTLEMENT FLOW (Step 10) =======
    if (aiResult.intent === 'SETTLEMENT') {
      // Step 10: Unauthorized attempt check
      if (numberRole !== 'AUTHORIZED_FINANCE') {
        this.logger.warn(
          `Unauthorized settlement attempt from ${customerWhatsapp} on tenant ${tenantId}`,
        );
        return; // Drop silently per step 10 spec
      }

      const { partyIdentifier, entryType, amount } = aiResult.extractedData as {
        partyIdentifier?: string;
        entryType?: string;
        amount?: number;
      };

      // Delegate validation to SettlementService
      const validation = this.settlementService.validateSettlementRequest({
        partyIdentifier,
        entryType,
        amount,
      });
      if (!validation.ok) {
        await this.enqueueOutgoing(
          tenantId,
          customerWhatsapp,
          validation.error,
        );
        return;
      }

      // Process settlement request (creates PendingSettlement only)
      const responseText = await this.settlementService.requestSettlement(
        tenantId,
        partyIdentifier as string,
        entryType as LedgerEntryType,
        Number(amount),
        customerWhatsapp,
        whatsappMessageId,
        messageText,
      );

      await this.outgoingQueue.add(
        'settlement-request',
        {
          tenantId,
          recipientWhatsapp: customerWhatsapp,
          messageContent: responseText,
        },
        { removeOnComplete: true },
      );
    }
  }
}
