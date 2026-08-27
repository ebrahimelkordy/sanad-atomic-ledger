import { Injectable } from '@nestjs/common';
import { LedgerEntryType } from '@prisma/client';

import { Prisma } from '@prisma/client';
import { TransactionRunner } from '../repositories/transaction-runner.service';
import { PendingSettlementRepository } from '../repositories/pending-settlement.repository';
import { LedgerEntryRepository } from '../repositories/ledger-entry.repository';
import { FinancialLedgerSummaryRepository } from '../repositories/financial-ledger-summary.repository';
import { isSourceWhatsappMessageIdConflict } from './idempotency.util';

export type SettlementReceipt = {
  ledger_entry_id: string;
  running_balance: string;
  confirmation_text: string;
};

type AmountLike = Prisma.Decimal | number | string;

type EntryLike = {
  entry_type: LedgerEntryType;
  amount: AmountLike;
};

/**
 * Validates settlement request data before processing.
 */
export type ValidationResult = { ok: true } | { ok: false; error: string };

@Injectable()
export class SettlementService {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly pendingSettlementRepository: PendingSettlementRepository,
    private readonly ledgerEntryRepository: LedgerEntryRepository,
    private readonly financialLedgerSummaryRepository: FinancialLedgerSummaryRepository,
  ) {}

  /**
   * Validates extracted settlement data.
   */
  validateSettlementRequest(data: {
    partyIdentifier?: string;
    entryType?: string;
    amount?: number;
  }): ValidationResult {
    const { partyIdentifier, entryType, amount } = data;
    if (!partyIdentifier) {
      return {
        ok: false,
        error: 'بيانات التسوية غير مكتملة: معرف الطرف مطلوب.',
      };
    }
    if (!entryType || (entryType !== 'CREDIT' && entryType !== 'DEBIT')) {
      return { ok: false, error: 'نوع القيد يجب أن يكون CREDIT أو DEBIT.' };
    }
    if (
      amount === undefined ||
      amount === null ||
      isNaN(amount) ||
      amount <= 0
    ) {
      return { ok: false, error: 'المبلغ يجب أن يكون رقم موجب أكبر من صفر.' };
    }
    return { ok: true };
  }

  /**
   * Checks whether a message from an AUTHORIZED_FINANCE number is a
   * settlement confirmation reply (approve/reject) to an active PendingSettlement.
   */
  async checkConfirmationReply(
    tenantId: string,
    requestedBy: string,
    messageText: string,
  ): Promise<{ isConfirmation: boolean; result?: string | SettlementReceipt }> {
    const pending =
      await this.pendingSettlementRepository.findActiveByTenantAndRequester(
        tenantId,
        requestedBy,
      );
    if (!pending) {
      return { isConfirmation: false };
    }

    const normalized = (messageText ?? '').trim().toLowerCase();
    const isReject =
      normalized === 'إلغاء' ||
      normalized === 'الغاء' ||
      normalized === 'لا' ||
      normalized === 'cancel' ||
      normalized === 'رفض';
    const isApprove =
      normalized === 'تأكيد' ||
      normalized === 'تاكيد' ||
      normalized === 'نعم' ||
      normalized === 'yes' ||
      normalized === 'confirm' ||
      normalized === 'موافق';

    if (!isReject && !isApprove) {
      return { isConfirmation: false };
    }

    const result = await this.confirmSettlement(
      tenantId,
      requestedBy,
      messageText,
    );
    return { isConfirmation: true, result };
  }

  /**
   * Step 05 Sequence Flow 2 - Step 1: requestSettlement
   */
  async requestSettlement(
    tenantId: string,
    partyIdentifier: string,
    entryType: LedgerEntryType,
    amount: AmountLike,
    requestedBy: string,
    whatsappMessageId: string,
    rawMessageText: string,
  ): Promise<string> {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    try {
      await this.pendingSettlementRepository.createPendingSettlement({
        tenant_id: tenantId,
        party_identifier: partyIdentifier,
        entry_type: entryType,
        amount,
        requested_by: requestedBy,
        source_whatsapp_message_id: whatsappMessageId,
        raw_message_text: rawMessageText,
        expires_at: expiresAt,
      });

      return `تأكيد تسجيل ${entryType === 'DEBIT' ? 'مدين' : 'دائن'} بمبلغ ${amount.toString()} جنيه على ${partyIdentifier}؟ رد بـ (تأكيد) أو (إلغاء) خلال 5 دقايق`;
    } catch (err) {
      if (isSourceWhatsappMessageIdConflict(err)) {
        const existing =
          await this.pendingSettlementRepository.findBySourceMessageId(
            whatsappMessageId,
          );
        if (!existing) throw err;

        return `تأكيد تسجيل ${existing.entry_type === 'DEBIT' ? 'مدين' : 'دائن'} بمبلغ ${existing.amount.toString()} جنيه على ${existing.party_identifier}؟ رد بـ (تأكيد) أو (إلغاء) خلال 5 دقايق`;
      }
      throw err;
    }
  }

  /**
   * Step 05 Sequence Flow 2 - Step 2: confirmSettlement
   */
  async confirmSettlement(
    tenantId: string,
    requestedBy: string,
    replyText: string,
  ): Promise<string | SettlementReceipt> {
    const pending =
      await this.pendingSettlementRepository.findActiveByTenantAndRequester(
        tenantId,
        requestedBy,
      );

    if (!pending) {
      return 'مفيش تسوية معلّقة تستنى تأكيد';
    }

    const normalized = (replyText ?? '').trim().toLowerCase();
    const isReject =
      normalized === 'إلغاء' ||
      normalized === 'الغاء' ||
      normalized === 'لا' ||
      normalized === 'cancel' ||
      normalized === 'رفض';
    const isApprove =
      normalized === 'تأكيد' ||
      normalized === 'تاكيد' ||
      normalized === 'نعم' ||
      normalized === 'yes' ||
      normalized === 'confirm' ||
      normalized === 'موافق';

    if (isReject) {
      await this.pendingSettlementRepository.markRejected(pending.id);
      return 'تم تأكيد الإلغاء ولم يتم تسجيل أي قيد.';
    }

    if (!isApprove) {
      return 'رد غير معروف. لازم (تأكيد) أو (إلغاء)';
    }

    // Approved => one transaction for ledger write + summary recompute + markConfirmed
    try {
      const receipt = await this.tx.run(async (txClient) => {
        try {
          const ledgerCreated =
            await this.ledgerEntryRepository.appendLedgerEntry(
              {
                tenant_id: tenantId,
                party_identifier: pending.party_identifier,
                entry_type: pending.entry_type,
                amount: pending.amount,
                authorized_action_by: requestedBy,
                source_whatsapp_message_id: pending.source_whatsapp_message_id,
                raw_message_text: pending.raw_message_text,
              },
              txClient,
            );

          const allEntries =
            await this.ledgerEntryRepository.findByTenantAndParty(
              tenantId,
              pending.party_identifier,
              txClient,
            );
          const { total_debit, total_credit, running_balance } =
            this.recalculate(allEntries);

          await this.financialLedgerSummaryRepository.upsertSummary(
            tenantId,
            pending.party_identifier,
            {
              total_debit,
              total_credit,
              running_balance,
              last_transaction_type: pending.entry_type,
              last_recalculated_at: new Date(),
            },
            txClient,
          );

          await this.pendingSettlementRepository.markConfirmed(
            pending.id,
            txClient,
          );

          return {
            ledger_entry_id: ledgerCreated.id,
            running_balance: running_balance.toString(),
            confirmation_text: 'تم تأكيد التسوية بنجاح.',
          };
        } catch (err) {
          if (isSourceWhatsappMessageIdConflict(err)) {
            const existingLedger =
              await this.ledgerEntryRepository.findBySourceMessageId(
                pending.source_whatsapp_message_id,
                txClient,
              );

            if (existingLedger) {
              const allEntries =
                await this.ledgerEntryRepository.findByTenantAndParty(
                  tenantId,
                  pending.party_identifier,
                  txClient,
                );
              const { running_balance } = this.recalculate(allEntries);
              return {
                ledger_entry_id: existingLedger.id,
                running_balance: running_balance.toString(),
                confirmation_text: 'تم تأكيد التسوية بنجاح.',
              };
            }
          }

          throw err;
        }
      });

      return receipt;
    } catch (err) {
      // Outside the transaction conflict handling
      if (isSourceWhatsappMessageIdConflict(err)) {
        const existingLedger =
          await this.ledgerEntryRepository.findBySourceMessageId(
            pending.source_whatsapp_message_id,
          );
        if (!existingLedger) throw err;

        const allEntries =
          await this.ledgerEntryRepository.findByTenantAndParty(
            tenantId,
            pending.party_identifier,
          );

        const { running_balance } = this.recalculate(allEntries);

        return {
          ledger_entry_id: existingLedger.id,
          running_balance: running_balance.toString(),
          confirmation_text: 'تم تأكيد التسوية بنجاح.',
        };
      }

      throw err;
    }
  }

  private recalculate(entries: Array<EntryLike>) {
    const toDecimal = (amount: AmountLike): Prisma.Decimal => {
      if (amount instanceof Prisma.Decimal) return amount;
      return new Prisma.Decimal(amount.toString());
    };

    let total_debit = new Prisma.Decimal(0);
    let total_credit = new Prisma.Decimal(0);
    let running_balance = new Prisma.Decimal(0);

    for (const e of entries) {
      const amt = toDecimal(e.amount);
      if (e.entry_type === 'DEBIT') {
        total_debit = total_debit.plus(amt);
        running_balance = running_balance.minus(amt);
      } else {
        total_credit = total_credit.plus(amt);
        running_balance = running_balance.plus(amt);
      }
    }

    return { total_debit, total_credit, running_balance };
  }
}
