# Cipher — Multi-Tenant WhatsApp AI Assistant
## Production Prompt (Improved Prompt Engineering)

# ROLE

You are an expert Software Architect, Database Architect, and Technical Documentation Generator.

Your responsibility is to transform the specification into architecture artifacts only.

You are NOT redesigning the system.
You are NOT changing the architecture.
You are NOT optimizing the design.
You are ONLY documenting the specification faithfully.

# OBJECTIVE

Generate all requested architecture artifacts exactly from the specification below.

# GLOBAL CONSTRAINTS

- Never invent entities, fields, relationships, modules, or business logic.
- Never rename or remove existing items.
- Never simplify or optimize the architecture.
- Maintain complete consistency across all artifacts.
- The specification is the single source of truth.

# DELIVERABLES

1. ERD
2. System Architecture Diagram
3. Sequence Diagram – Automated Order Placement
4. Sequence Diagram – Financial Settlement
5. Documentation

# OUTPUT FORMAT

For every artifact include:
- Title
- Diagram
- Short Description
- Components Explanation
- Notes

# SPECIFICATION

# Cipher — Multi-Tenant WhatsApp AI Assistant
## Corrected Architecture Prompt (v2) — for Eraser AI

---

## INSTRUCTIONS TO ERASER AI

Using the specification below, generate the following, in this order:

1. **Entity Relationship Diagram (ERD)** in crow's foot notation, based on Section 4 — include every entity, field, data type, and relationship exactly as listed, including the corrected `LedgerEntry` / `FinancialLedgerSummary` split and the `unit_price_at_order` field.
2. **System Architecture Diagram** showing all components in Section 2 and Section 3: Next.js frontend, Nest.js backend modules (tenant-manager, whatsapp-gateway, sales-automation, finance-ledger, ai-orchestrator), the Redis/BullMQ queue layer sitting between the WhatsApp Gateway and the Worker processes, the shared PostgreSQL database with tenant_id-based isolation, and the AIProvider abstraction with its swappable implementations (Gemini/OpenAI/Local).
3. **Sequence Diagrams** for both flows in Section 5 (Automated Order Placement, and Financial Account Settlement) — show every actor (Customer/Manager, Baileys Gateway, BullMQ Queue, Worker, Nest.js Guards, AI-Orchestrator, PostgreSQL) and every step in order, including the row-level lock and the append-only ledger write.
4. **Written documentation** accompanying each diagram: a short paragraph under each diagram explaining its purpose, followed by a bullet list explaining each major component/entity and why it exists (reference the "Summary of fixes applied" section at the end for the reasoning behind the corrected design decisions).

Keep diagrams and documentation consistent with each other — no entity, field, or flow step should appear in one artifact and be missing from another.

---

### 1. TECH STACK
- Frontend: Next.js (TypeScript, TailwindCSS)
- Backend: Nest.js (TypeScript)
- Database: PostgreSQL with Prisma ORM — **shared DB, isolated by `tenant_id`** (corrected from separate-DB-per-tenant for maintainability; enforced via Prisma middleware that injects `tenant_id` on every query)
- Queue: **Redis + BullMQ** — incoming WhatsApp/web messages are pushed to a queue immediately; a Worker process consumes and processes them asynchronously
- WhatsApp Gateway: Node.js Baileys library (Multi-session WebSocket wrapper)
- AI Layer: Provider-agnostic interface (see Section 6)

---

### 2. CORE ARCHITECTURE
1. **Multi-Tenant Isolation**: Global Nest.js Guard/Middleware extracts `tenant_id` from the incoming phone number (via `TenantWhatsAppNumber` lookup) or from the authenticated web session, and injects it into the Prisma query context for every downstream call. No query is allowed to execute without a resolved `tenant_id`.
2. **WhatsApp Connection Pool**: Baileys Session Manager maintaining multiple active tenant WebSockets concurrently, with auto-reconnect and session persistence.
3. **Queue-First Ingestion**: Every inbound message (WhatsApp or web) is pushed to a BullMQ `incoming-messages` queue immediately. The gateway replies with a lightweight "received" ack. A Worker pool pulls from the queue for actual processing — this decouples message intake from processing load and prevents drops during spikes.
4. **Dynamic Routing (RBAC by Phone Number)**:
   - `PUBLIC_SALES`: Routes customers to AI Sales Agent for catalog checking, inventory, and automated orders.
   - `AUTHORIZED_FINANCE`: Routes authorized numbers to the Finance Ledger for account settlements and manual balance updates. Any number not explicitly marked `AUTHORIZED_FINANCE` is rejected before reaching the Finance module.
5. **Vertical-Specific Metadata**: JSONB schema injection mapped to industries (Restaurants, Pharmacies, Supermarkets) via a `vertical_type` template — tenants can extend fields within their vertical's allowed template, not arbitrarily.
6. **AI Provider Abstraction**: All AI calls go through a single `AIProvider` interface (see Section 6) so the underlying model (Gemini, OpenAI, local model) can be swapped without touching business logic.

---

### 3. FOLDER STRUCTURE
```
/backend
  /src
    /common
      /guards (tenant.guard.ts, finance-role.guard.ts)
      /interceptors
      /middleware (tenant-context.middleware.ts)
      /queue (bullmq.module.ts, incoming-message.processor.ts)
    /modules
      /tenant-manager
      /whatsapp-gateway (session.service.ts)
      /sales-automation (order-processor.service.ts, stock-lock.service.ts)
      /finance-ledger (ledger-entry.service.ts, settlement.service.ts)
      /ai-orchestrator (ai-provider.interface.ts, gemini.provider.ts, openai.provider.ts, local.provider.ts)
/frontend
  /src/app
    (auth)
    (dashboard)/tenants
    (dashboard)/orders
    (dashboard)/finance
```

---

### 4. ERD (CROW'S FOOT NOTATION) — Corrected

**Tenant**
- id UUID PK
- business_name String
- vertical_type Enum (restaurant, pharmacy, supermarket, ...)
- created_at DateTime

**TenantWhatsAppNumber**
- id UUID PK
- tenant_id UUID FK → Tenant
- phone_number String Unique
- number_role Enum (PUBLIC_SALES, AUTHORIZED_FINANCE)
- connection_status String

**InventoryProduct**
- id UUID PK
- tenant_id UUID FK → Tenant
- name String
- sku String
- current_stock Integer
- unit_price Decimal — **current/live price** (used for new orders going forward)
- vertical_metadata JSONB

**CustomerOrder**
- id UUID PK
- tenant_id UUID FK → Tenant
- customer_whatsapp String
- grand_total Decimal
- order_status Enum

**OrderDetail**
- id UUID PK
- order_id UUID FK → CustomerOrder
- product_id UUID FK → InventoryProduct
- quantity_ordered Integer
- **unit_price_at_order Decimal** — *(fix #4: snapshot of the price at the moment of the order, so historical invoices never change if the product price changes later)*

**LedgerEntry** *(new table — fix #3: append-only ledger, this is the source of truth)*
- id UUID PK
- tenant_id UUID FK → Tenant
- party_identifier String
- entry_type Enum (DEBIT, CREDIT)
- amount Decimal
- reference_order_id UUID FK → CustomerOrder (nullable, for manual entries)
- authorized_action_by String (nullable, phone number if manual settlement)
- created_at DateTime
- *(rule: rows are never updated or deleted — corrections are made via new offsetting entries)*

**FinancialLedgerSummary** *(renamed from FinancialLedger — fix #3: this is now a derived cache, not the source of truth)*
- id UUID PK
- tenant_id UUID FK → Tenant
- party_identifier String
- total_debit Decimal — recalculated from LedgerEntry
- total_credit Decimal — recalculated from LedgerEntry
- running_balance Decimal — recalculated, never manually reset
- last_transaction_type Enum
- last_recalculated_at DateTime

**Relationships**
- Tenant (1) — (M) TenantWhatsAppNumber, InventoryProduct, CustomerOrder, LedgerEntry, FinancialLedgerSummary
- CustomerOrder (1) — (M) OrderDetail
- InventoryProduct (1) — (M) OrderDetail
- CustomerOrder (1) — (0..M) LedgerEntry (via reference_order_id)

---

### 5. SEQUENCE FLOWS — Corrected

**Flow 1: Automated Order Placement (queue-based, concurrency-safe)**
1. Customer texts order request to Tenant's Public Number.
2. Baileys Gateway captures the message and pushes it to the `incoming-messages` BullMQ queue; sends an immediate "received" ack to the customer.
3. Worker picks up the job, resolves Tenant Context from the phone number.
4. AI-Orchestrator (via the `AIProvider` interface) classifies intent and extracts structured order data (product, quantity).
5. Sales Module opens a DB transaction: locks the relevant `InventoryProduct` row (`SELECT ... FOR UPDATE`), verifies `current_stock` is sufficient, decrements it, snapshots `unit_price` into `unit_price_at_order`, and creates `CustomerOrder` + `OrderDetail` records. Transaction commits.
6. A `LedgerEntry` (DEBIT, referencing the order) is created for the customer.
7. Worker pushes the response to the `outgoing-messages` queue → Baileys Gateway dispatches the automated invoice back to the customer.

**Flow 2: Financial Account Settlement (auditable, append-only)**
1. Manager texts settlement command (e.g., "صفي حساب فلان") to Tenant's Finance Number.
2. Message is queued and picked up by a Worker; Nest.js Guard queries `TenantWhatsAppNumber` — if sender's `number_role` is NOT `AUTHORIZED_FINANCE`, the request is dropped and logged as an unauthorized attempt.
3. If valid, Finance Ledger Module queries all `LedgerEntry` rows for the specific `party_identifier` to compute the current balance (never trusts a cached value blindly).
4. System creates a new **offsetting `LedgerEntry`** (CREDIT, `authorized_action_by` = manager's phone number) to bring the balance to zero — the original entries are never edited or deleted, preserving full audit history.
5. `FinancialLedgerSummary` is recalculated (not manually reset) from the updated `LedgerEntry` set.
6. Worker pushes confirmation → Gateway dispatches a settlement receipt back to the manager, including a reference to the offsetting entry ID for traceability.

---

### 6. AI Provider Interface (fix #6)
```typescript
interface AIProvider {
  classifyIntent(message: string, context: TenantContext): Promise<Intent>;
  extractStructuredData<T>(message: string, schema: JSONSchema, context: TenantContext): Promise<T>;
}
// Implementations: GeminiProvider, OpenAIProvider, LocalModelProvider
// Swappable via a single config value per tenant or globally — no business logic changes required.
```

---

### Summary of fixes applied
1. Shared DB + `tenant_id` isolation (was: separate DB per tenant — reverted for maintainability, enforced via middleware)
2. Redis + BullMQ queue layer restored for all message ingestion
3. `LedgerEntry` (append-only, source of truth) added; `FinancialLedgerSummary` is now a derived cache, never manually reset
4. `unit_price_at_order` added to `OrderDetail` to prevent retroactive price changes on historical invoices
5. Row-level locking (`SELECT ... FOR UPDATE`) specified in the order flow to prevent stock race conditions
6. `AIProvider` interface explicitly defined for provider-agnostic AI calls
7.

# SELF VALIDATION

Before finishing verify:

- Every entity exists.
- Every field exists.
- Every relationship exists.
- Every flow is represented.
- No information was invented.
- No information was omitted.
- Every document matches every diagram.
[View on Eraser![](https://app.eraser.io/workspace/9Hb1t7iVjA1J05EoL1gx/preview?diagram=Za_M2JVTKa-KZ6F54tFB&type=embed)](https://app.eraser.io/workspace/9Hb1t7iVjA1J05EoL1gx?diagram=Za_M2JVTKa-KZ6F54tFB)