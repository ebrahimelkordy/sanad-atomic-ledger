# TODO - Step 13: Testing Checklist Implementation

## Progress Tracking

### ✅ موجود فعلاً
- [x] `repositories.contract.spec.ts` — Repository contracts (LedgerEntry no update/delete, PendingSettlement no delete, OrderDetail findByOrderId only)
- [x] `guards.spec.ts` — TenantGuard + FinanceRoleGuard tests

### ✅ تم تنفيذه
- [x] `test/idempotency.spec.ts` — Idempotency util tests:
  - P2002 on source_whatsapp_message_id → true
  - Non-P2002 errors → false
  - P2002 on different field → false
  - OrderStatus values exist
- [x] `test/order-flow.spec.ts` — OrderProcessorService unit tests:
  - Unknown product → rejection with message
  - Ambiguous product (multiple name matches) → rejection asking clarification
  - Quantity <= 0 → throws error
  - Insufficient stock → REJECTED_INSUFFICIENT_STOCK, zero stock change, zero ledger entries
  - `findBySourceMessageId` called for duplicate `whatsappMessageId` → returns same existing order (no silent ignore)
- [x] `test/settlement-flow.spec.ts` — SettlementService unit tests:
  - requestSettlement: creates PendingSettlement, **no immediate LedgerEntry** ✅
  - requestSettlement duplicate: returns same confirmation text (idempotent) ✅
  - No active pending → "مفيش تسوية معلّقة"
  - Cancel → REJECTED, no ledger write
  - Confirm → LedgerEntry + summary + markConfirmed
- [x] `test/ai-orchestrator.spec.ts` — AIOrchestrator tests:
  - ORDER intent → items extracted
  - SETTLEMENT intent → party/amount extracted
  - UNKNOWN intent → default reply only
  - Fallback on primary provider failure
  - All 3 providers implement AIProvider interface
- [x] `test/multi-tenancy.spec.ts` — Multi-tenancy isolation:
  - Unique constraints on phone_number, tenant_id+sku, tenant_id+party_identifier
  - tenant_id index verification
  - Phone number extraction from body, body.to (WhatsApp webhook format), headers
  - Missing phone number → rejected
- [x] `test/finance-reconciliation.spec.ts` — Financial ledger reconciliation:
  - After settlement, running_balance = CREDIT_total - DEBIT_total (calculated from LedgerEntry source)
  - multiple DEBITs subtract sequentially
  - last_transaction_type recorded correctly
- [x] `test/app.e2e-spec.ts` — E2E Integration:
  - POST /auth/login → 401 for invalid/empty credentials
  - GET /tenants/me → returns data (JWT mocked)
  - GET /tenants/whatsapp-numbers → returns array
  - GET /orders → returns array
  - GET /finance/ledger → returns array
  - GET /finance/summary → returns array
  - GET /orders/:id with non-existent id → returns null
  - All protected endpoints return 401 without JWT

### 📝 Queue resilience tests (manual)
- [ ] Disconnect Redis temporarily → messages processed on reconnect
- [ ] WhatsApp send failure → automatic retry per BullMQ config (3 attempts, exponential backoff)

## Check list from plan 13
- [x] Idempotency tests (duplicate whatsappMessageId → single order, no duplicate stock/ledger)
- [x] Audit trail tests (source_whatsapp_message_id and raw_message_text stored)
- [x] Settlement confirmation (PendingSettlement → no immediate LedgerEntry → confirm creates entry)
- [x] DB layer (unique constraints on phone_number, tenant_id+sku)
- [x] Repository layer (no update/delete on LedgerEntry)
- [x] Order placement (CONFIRMED, REJECTED_INSUFFICIENT_STOCK, unregistered drop, quantity>0)
- [x] Settlement (AUTHORIZED_FINANCE allowed, PUBLIC_SALES rejected, negative amount rejected)
- [x] AI Orchestrator (UNKNOWN no-op, provider switching via env)
- [x] Multi-tenancy isolation
- [ ] Queue resilience (manual)
