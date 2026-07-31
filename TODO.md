# TODO

## ESLint no-unsafe-* + unused-vars fixes (backend)

### Step 1 ✅
- [x] Remove unsafe any/string conversions in `apps/backend/src/services/order-processor.service.ts`.
  - Replaced `'REJECTED_INSUFFICIENT_STOCK'` → `OrderStatusEnum.REJECTED_INSUFFICIENT_STOCK`
  - Replaced `'CONFIRMED'` → `OrderStatusEnum.CONFIRMED`

### Step 2 ✅
- [x] Fix `apps/backend/src/services/settlement.service.ts`:
  - Already clean — no unused vars (`total_debit`, `total_credit` are used in `upsertSummary`)
  - No `(ledgerCreated as any).id` pattern — uses proper typing
  - `recalculate()` properly typed with `AmountLike`/`EntryLike` — no `any` usage

### Step 3 ✅
- [x] Fix `apps/backend/src/ai-orchestrator/local-model.provider.ts`:
  - Fixed `response.json()` `any` type by casting to `{ response: string }`
  - Fixed 3 lint errors (no-unsafe-assignment, no-unsafe-argument, no-unsafe-member-access)

### Step 4 ✅
- [x] Rerun backend lint: `cd apps/backend && npm -s run lint -- --max-warnings=0`
  - **Before:** 42 problems (29 errors, 13 warnings)
  - **After:** 39 problems (27 errors, 12 warnings)
  - Remaining 39 issues are in controllers, auth, and whatsapp-gateway files (out of scope)

