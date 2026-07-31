/**
 * القاعدة #4: TRANSACTION SAFETY & ATOMIC OPERATIONS
 *
 * InventoryOperationsService = خدمة متخصصة لعمليات المخزون المعقدة التي تحتاج
 * لعدة خطوات في قاعدة البيانات (بحث منتج → قفل الصف → خصم المخزون → تسجيل قيد مالي
 * → تحديث الملخص المالي). كل هذه الخطوات تُنفّذ كـ TRANSACTION واحدة:
 *   - لو أي خطوة فشلت → يتراجع كل شيء Rollback تلقائياً بالكامل.
 *   - لا توجد سجلات يتيمة (orphaned records) نهائياً.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransactionRunner } from '../repositories/transaction-runner.service';
import { InventoryProductRepository } from '../repositories/inventory-product.repository';
import { LedgerEntryRepository } from '../repositories/ledger-entry.repository';
import { FinancialLedgerSummaryRepository } from '../repositories/financial-ledger-summary.repository';
import { InventoryWithdrawalSchema } from '../validation';
import type { ValidatedInventoryWithdrawalPayload } from '../validation';

export type LineWithdrawalResult = {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unit_price: number;
  line_value: number;
};

export type InventoryWithdrawalReceipt = {
  total_value: number;
  lines: LineWithdrawalResult[];
  party_identifier: string;
  ledger_entry_id?: string;
  failures: string[];
};

export type ReturnToInventoryReceipt = {
  total_lines: number;
  total_quantity: number;
  results: Array<{ productName: string; quantity: number; message: string }>;
};

@Injectable()
export class InventoryOperationsService {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly inventoryRepo: InventoryProductRepository,
    private readonly ledgerEntryRepo: LedgerEntryRepository,
    private readonly financialLedgerSummaryRepo: FinancialLedgerSummaryRepository,
  ) {}

  /**
   * خصم مخزون متعدد الأصناف مع تسجيل قيد مالي تلقائي في نفس المعاملة (TRANSACTION).
   *
   * الخطوات:
   *  1. إخضاع الـ payload لـ Zod validation.
   *  2. بدء transaction.
   *  3. لكل صنف: البحث → قفل الصف → فحص المخزون المتاح → خصم الكمية.
   *  4. حساب الإجمالي → إنشاء LedgerEntry باسم الموظف.
   *  5. إعادة حساب الملخص المالي للطرف.
   *  6. COMMIT → إذا فشل أي خطوة تلقائياً ROLLBACK لكل شيء.
   */
  async withdrawInventoryWithLedger(
    tenantId: string,
    employeeName: string,
    payload: Partial<ValidatedInventoryWithdrawalPayload> & {
      items: Array<{ productNameOrSku: string; quantity: number }>;
      requestedBy: string;
      sourceMessageId?: string;
      rawMessageText?: string;
    },
  ): Promise<InventoryWithdrawalReceipt> {
    // 1) VALIDATION أولاً قبل أي اتصال بالقاعدة
    const validated = InventoryWithdrawalSchema.parse({
      employeeName: employeeName || payload.employeeName,
      items: payload.items,
      notes: payload.notes,
    });

    const partyIdentifier = `موظف: ${validated.employeeName}`;
    const sourceMsgId = payload.sourceMessageId || `CHAT-WITHDRAW-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // 2) TRANSACTION ONE SHOT
    return this.tx.run(async (txClient) => {
      const lines: LineWithdrawalResult[] = [];
      const failures: string[] = [];

      for (const item of validated.items) {
        // 2a. البحث عن المنتج (بحث بـ SKU أولاً ثم الاسم)
        let product = await this.inventoryRepo.findByTenantAndSku(
          tenantId,
          item.productNameOrSku,
          txClient,
        );
        if (!product) {
          const byName = await this.inventoryRepo.findByTenantAndName(
            tenantId,
            item.productNameOrSku,
            txClient,
          );
          product = byName[0] ?? null;
        }

        if (!product) {
          failures.push(`❌ المنتج "${item.productNameOrSku}" غير موجود.`);
          continue;
        }

        // 2b. قفل الصف (SELECT FOR UPDATE) لحماية السباقات
        await this.inventoryRepo.lockForUpdate(product.id, txClient as Prisma.TransactionClient);

        // إعادة التحقق من الكمية بعد القفل
        const latest = (await this.inventoryRepo.findByTenantAndSku(
          tenantId,
          product.sku,
          txClient,
        ))!;
        if (latest.current_stock < item.quantity) {
          failures.push(
            `❌ المخزون غير كافٍ للمنتج "${latest.name}". المتاح: ${latest.current_stock}, المطلوب: ${item.quantity}.`,
          );
          continue;
        }

        // 2c. الخصم الفعلي
        await this.inventoryRepo.decrementStockWithLock(
          latest.id,
          item.quantity,
          txClient as Prisma.TransactionClient,
        );
        const lineValue = item.quantity * Number(latest.unit_price);
        lines.push({
          productId: latest.id,
          productName: latest.name,
          sku: latest.sku,
          quantity: item.quantity,
          unit_price: Number(latest.unit_price),
          line_value: lineValue,
        });
      }

      // 3) إذا لم تكن هناك أسطر ناجحة → فشل وإرجاع الأخطاء فقط
      if (lines.length === 0) {
        return {
          total_value: 0,
          lines: [],
          party_identifier: partyIdentifier,
          failures,
        };
      }

      // 4) تسجيل القيد المالي وإعادة حساب الملخص — كل هذا داخل نفس الـ transaction!
      const totalValue = lines.reduce((acc, l) => acc + l.line_value, 0);
      const ledger = await this.ledgerEntryRepo.appendLedgerEntry(
        {
          tenant_id: tenantId,
          party_identifier: partyIdentifier,
          entry_type: 'DEBIT',
          amount: totalValue,
          authorized_action_by: payload.requestedBy,
          source_whatsapp_message_id: sourceMsgId,
          raw_message_text: payload.rawMessageText ?? null,
        },
        txClient as Prisma.TransactionClient,
      );

      const allEntries = await this.ledgerEntryRepo.findByTenantAndParty(
        tenantId,
        partyIdentifier,
        txClient as Prisma.TransactionClient,
      );
      const { total_debit, total_credit, running_balance } =
        InventoryOperationsService.recalcSummary(allEntries);

      await this.financialLedgerSummaryRepo.upsertSummary(
        tenantId,
        partyIdentifier,
        {
          total_debit,
          total_credit,
          running_balance,
          last_transaction_type: 'DEBIT',
          last_recalculated_at: new Date(),
        },
        txClient as Prisma.TransactionClient,
      );

      return {
        total_value: totalValue,
        lines,
        party_identifier: partyIdentifier,
        ledger_entry_id: ledger.id,
        failures,
      };
    });
  }

  /**
   * إرجاع أصناف للمخزون مع خصم من قيد الموظف المالي (إذا كان مبلغ موجباً).
   * TRANSACTION واحدة للخصم + القيد المالي.
   */
  async returnToInventoryWithLedger(
    tenantId: string,
    returnParty: string,
    items: Array<{ productNameOrSku: string; quantity: number }>,
    params: {
      requestedBy: string;
      sourceMessageId?: string;
      rawMessageText?: string;
    },
  ): Promise<ReturnToInventoryReceipt> {
    return this.tx.run(async (txClient) => {
      const results: ReturnToInventoryReceipt['results'] = [];
      let totalQty = 0;

      for (const item of items) {
        let product = await this.inventoryRepo.findByTenantAndSku(
          tenantId,
          item.productNameOrSku,
          txClient,
        );
        if (!product) {
          const byName = await this.inventoryRepo.findByTenantAndName(
            tenantId,
            item.productNameOrSku,
            txClient,
          );
          product = byName[0] ?? null;
        }
        if (!product) {
          results.push({
            productName: item.productNameOrSku,
            quantity: item.quantity,
            message: `❌ "${item.productNameOrSku}" غير موجود.`,
          });
          continue;
        }
        const p = await this.inventoryRepo.incrementStock(
          product.id,
          item.quantity,
          txClient,
        );
        results.push({
          productName: p.name,
          quantity: item.quantity,
          message: `✅ إرجاع ${item.quantity} من "${p.name}" للمخزون.`,
        });
        totalQty += item.quantity;
      }

      if (returnParty && totalQty > 0) {
        const partyId = `موظف: ${returnParty}`;
        const sourceMsgId =
          params.sourceMessageId || `CHAT-RETURN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        await this.ledgerEntryRepo.appendLedgerEntry(
          {
            tenant_id: tenantId,
            party_identifier: partyId,
            entry_type: 'CREDIT',
            amount: totalQty,
            authorized_action_by: params.requestedBy,
            source_whatsapp_message_id: sourceMsgId,
            raw_message_text: params.rawMessageText ?? null,
          },
          txClient as Prisma.TransactionClient,
        );
        const allEntries = await this.ledgerEntryRepo.findByTenantAndParty(
          tenantId,
          partyId,
          txClient as Prisma.TransactionClient,
        );
        const { total_debit, total_credit, running_balance } =
          InventoryOperationsService.recalcSummary(allEntries);
        await this.financialLedgerSummaryRepo.upsertSummary(
          tenantId,
          partyId,
          {
            total_debit,
            total_credit,
            running_balance,
            last_transaction_type: 'CREDIT',
            last_recalculated_at: new Date(),
          },
          txClient as Prisma.TransactionClient,
        );
      }

      return { total_lines: results.length, total_quantity: totalQty, results };
    });
  }

  /* ================= HELPERS ================= */

  private static recalcSummary(entries: Array<{ entry_type: string; amount: any }>) {
    const toNum = (x: any) => Number(String(x ?? 0));
    let debit = 0;
    let credit = 0;
    let running = 0;
    for (const e of entries) {
      const n = toNum(e.amount);
      if (e.entry_type === 'DEBIT') {
        debit += n;
        running -= n;
      } else {
        credit += n;
        running += n;
      }
    }
    return { total_debit: debit, total_credit: credit, running_balance: running };
  }
}
