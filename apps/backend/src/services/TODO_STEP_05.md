# TODO - Step 05 (Service Layer: Business Logic)

## Plan/Work Items
- [ ] Remove lint errors from AI providers to make repo buildable (only as needed to unblock Step 05 verification).
- [ ] Implement/repair `OrderProcessorService.processOrder` to exactly follow Step 05:
  - [ ] product resolution rules: unknown rejects all; ambiguous rejects with clarification using >1 candidates from `findByTenantAndName`.
  - [ ] enforce `quantity_ordered > 0` before any processing.
  - [ ] single Prisma transaction for stock/order/ledger when all items have enough stock.
  - [ ] if any item insufficient stock: write rejected order via a small separate transaction; do not touch stock/ledger.
  - [ ] snapshot historical pricing: `unit_price_at_order` saved from current unit price at execution.
  - [ ] idempotency: catch unique constraint on `source_whatsapp_message_id` only; then fetch existing order and return its original confirmation/rejection response.
  - [ ] transaction boundaries: all repository calls inside transaction must receive the same `tx`.
  - [ ] ensure `LedgerEntryRepository.appendLedgerEntry` uses `authorized_action_by = null`.
- [ ] Implement/repair `SettlementService` to exactly follow Step 05 sequence flow 2:
  - [ ] `requestSettlement` only creates `PendingSettlement`; never writes ledger/summary.
  - [ ] idempotency on `source_whatsapp_message_id` via `createPendingSettlement` unique conflict -> `findBySourceMessageId` and return same confirmation text.
  - [ ] `confirmSettlement` loads pending via `findActiveByTenantAndRequester`.
  - [ ] reject reply path: markRejected only, no ledger write.
  - [ ] approve reply path: one Prisma transaction that:
    - [ ] finds summary via `FinancialLedgerSummaryRepository.findByTenantAndParty`
    - [ ] appends ledger entry with `authorized_action_by = requestedBy` and source/raw copied from PendingSettlement
    - [ ] recalculates totals from LedgerEntry only (no summary as truth)
    - [ ] upserts summary
    - [ ] marks pending confirmed
  - [ ] idempotency in confirm: unique conflict on `LedgerEntry.source_whatsapp_message_id` -> return same receipt by loading `findBySourceMessageId`.
  - [ ] handle expired pending: return clear text, no execution.

## Validation Checklist
- [ ] No `PrismaClient` import exists in services.
- [ ] No “MessageIdempotencyService” / “ProcessedMessage”.
- [ ] OrderProcessor + Settlement catch unique constraint by `source_whatsapp_message_id` only.
- [ ] OrderProcessor rejects full order on unknown/ambiguous/insufficient stock (no partial fulfillment).
- [ ] Quantity rule: `quantity_ordered > 0`.
- [ ] Ledger append-only behavior preserved (no update/delete).
- [ ] All multi-write operations use a single `$transaction` with same `tx` passed to repositories.
- [ ] Run `npm -w apps/backend run lint -- --max-warnings=0` and ensure clean.

