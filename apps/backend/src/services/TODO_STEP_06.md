# TODO - Step 06 (Integration: WhatsApp Business API + Notifications)

## Overview
Step 06 integrates the WhatsApp Business API with Twilio, implements all notification events from Steps 02-05, and ensures end-to-end message flow verification.

## Plan/Work Items

### 1. Remove remaining lint errors (unblock Step 06)
- [ ] Fix TypeScript compilation warnings/errors
- [ ] Ensure project builds successfully before testing

### 2. WhatsApp Business API Integration
- [ ] Configure Twilio CLI and install twilio npm package
- [ ] Create `TwilioClient` service with phone number, message service SID, and token authentication
- [ ] Implement async send/receive methods for all message types (text, image, PDF)
- [ ] Handle WhatsApp webhook callbacks for incoming messages and delivery receipts
- [ ] Store conversation state in database to track chat history

### 3. Notification Event Implementation
Implement handlers for all events from previous steps:

#### Step 02 Events:
- [ ] **New Message Handler** (`handleNewMessage`):
  - Parse incoming WhatsApp JSON payload
  - Extract `contact_id`, `message_type`, content
  - Create WhatsAppConversation record via repository
  - Store message in database and send Twilio confirmation

- [ ] **WhatsApp Message Forward Handler** (`handleMessageForward`):
  - Detect forwarded messages (via Twilio webhook data)
  - Extract forward metadata and create Conversation with appropriate flags

#### Step 03 Events:
- [ ] **Order Status Confirmation Handler** (`handleOrderStatusConfirmation`):
  - Parse order details from WhatsApp payload
  - Validate inventory availability via InventoryRepository
  - Create Order record via OrderRepository (transactional)
  - Send Twilio confirmation message to customer

- [ ] **Inventory Check Alert Handler** (`handleInventoryCheckAlert`):
  - Extract product_id and quantity from payload
  - Query ProductRepository for stock levels
  - Create AlertRecord or push notification if stock is low
  - Notify relevant staff via internal channel

#### Step 04 Events:
- [ ] **Order Cancellation Request Handler** (`handleCancellationRequest`):
  - Validate order existence and status in OrderRepository
  - Check cancellation policy (time window, reason validity)
  - Process refund if applicable via PaymentProcessorService
  - Update Order status to 'cancelled'
  - Send Twilio confirmation/rejection

- [ ] **Customer Support Request Handler** (`handleSupportRequest`):
  - Create SupportTicket record via repository
  - Categorize request type and priority
  - Assign to appropriate support agent (round-robin or skill-based)
  - Send acknowledgment message to customer
  - Create internal notification for support team

#### Step 05 Events:
- [ ] **Order Processing Confirmation** (`handleOrderProcessingConfirmation`):
  - Load Order from repository (idempotency check on source_whatsapp_message_id)
  - Verify processing state
  - Send confirmation with order summary and estimated timeline

- [ ] **Settlement Confirmation Handler** (`handleSettlementConfirmation`):
  - Load PendingSettlement via idempotency key
  - Confirm settlement in repository (transactional)
  - Create LedgerEntry for settlement
  - Generate FinancialLedgerSummary if applicable
  - Send Twilio confirmation to requester

- [ ] **Payment Settlement Request Handler** (`handlePaymentSettlementRequest`):
  - Validate request against PendingSettlement record
  - Execute payment gateway transaction via PaymentProcessorService
  - Update settlement status in repository
  - Generate audit trail entry
  - Send Twilio response

### 4. Event Dispatcher Pattern
- [ ] Create `EventDispatcher` singleton/service:
  - Register event handlers with specific event types
  - Publish events from main application flow
  - Support async/await patterns for non-blocking processing

- [ ] Implement message routing middleware:
  - Route messages to appropriate handlers based on content/type
  - Handle unknown events gracefully (log, notify admin)
  - Implement rate limiting and retry logic for failed deliveries

### 5. Database Schema Updates
- [ ] Add WhatsAppConversation table with fields:
  - `id` (UUID, PK)
  - `source_whatsapp_message_id` (VARCHAR, unique index)
  - `conversation_id` (UUID, FK to Conversations)
  - `contact_id` (UUID, FK to Contacts)
  - `message_type` (ENUM: text, image, pdf, document)
  - `content` (JSONB for flexible content storage)
  - `direction` (ENUM: incoming, outgoing)
  - `status` (ENUM: pending, delivered, read, failed)
  - `timestamp` (TIMESTAMP DEFAULT NOW())

- [ ] Add AlertRecord table for inventory/service alerts:
  - `id` (UUID, PK)
  - `alert_type` (VARCHAR)
  - `priority` (INT)
  - `message_content` (JSONB)
  - `status` (ENUM: active, resolved)
  - `created_at` (TIMESTAMP DEFAULT NOW())

- [ ] Add SupportTicket table for support requests:
  - `id` (UUID, PK)
  - `conversation_id` (UUID, FK to Conversations)
  - `request_type` (ENUM: query, complaint, suggestion, technical)
  - `priority` (INT)
  - `assigned_agent_id` (UUID, FK to Agents or null)
  - `status` (ENUM: open, in_progress, resolved, closed)
  - `metadata` (JSONB for additional details)

- [ ] Update migration files with new tables and indexes

### 6. API Endpoint Updates
- [ ] Add webhook endpoint `/webhooks/whatsapp` to receive Twilio callbacks
- [ ] Add order status polling endpoint for fallback processing
- [ ] Add support ticket management endpoints (create, list, assign, update)
- [ ] Add conversation history retrieval endpoint
- [ ] Implement message templates for standard responses

### 7. Error Handling & Logging
- [ ] Implement comprehensive error handling:
  - Twilio API failures (timeout, invalid phone, etc.)
  - Database transaction conflicts
  - Missing or malformed payload data
  - Rate limit exceeded scenarios

- [ ] Add structured logging for all events:
  - Log incoming WhatsApp messages with correlation IDs
  - Log handler execution and outcomes
  - Log error details with stack traces to /logs directory

### 8. Testing Strategy
- [ ] Unit tests for each event handler (mock repositories)
- [ ] Integration tests for Twilio webhook processing
- [ ] End-to-end tests simulating full message flow
- [ ] Load tests for high-volume messaging scenarios
- [ ] Error injection tests (network failures, API timeouts)

### 9. Documentation
- [ ] Document Twilio webhook configuration and authentication
- [ ] Create event handler API documentation
- [ ] Write troubleshooting guide for common issues
- [ ] Add deployment checklist for WhatsApp Business integration

## Implementation Notes
- Use dependency injection for repositories to support test mocking
- Implement idempotency keys for all write operations
- Support message queuing (RabbitMQ/Kafka) for async processing
- Handle pagination for large conversation histories
- Implement message templates for consistent responses
