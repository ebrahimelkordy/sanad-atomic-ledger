-- CreateEnum
CREATE TYPE "VerticalType" AS ENUM ('RESTAURANT', 'PHARMACY', 'RETAIL');

-- CreateEnum
CREATE TYPE "NumberRole" AS ENUM ('PUBLIC_SALES', 'AUTHORIZED_FINANCE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED_INSUFFICIENT_STOCK', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "PendingSettlementStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "business_name" TEXT NOT NULL,
    "vertical_type" "VerticalType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_whatsapp_numbers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "number_role" "NumberRole" NOT NULL,
    "connection_status" TEXT NOT NULL DEFAULT 'DISCONNECTED',

    CONSTRAINT "tenant_whatsapp_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_products" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "current_stock" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "vertical_metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "inventory_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_whatsapp" TEXT NOT NULL,
    "grand_total" DECIMAL(12,2) NOT NULL,
    "order_status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "source_whatsapp_message_id" TEXT NOT NULL,
    "raw_message_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_details" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity_ordered" INTEGER NOT NULL,
    "unit_price_at_order" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "order_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "party_identifier" TEXT NOT NULL,
    "entry_type" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference_order_id" UUID,
    "authorized_action_by" TEXT,
    "source_whatsapp_message_id" TEXT,
    "raw_message_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_settlements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "party_identifier" TEXT NOT NULL,
    "entry_type" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "requested_by" TEXT NOT NULL,
    "source_whatsapp_message_id" TEXT NOT NULL,
    "raw_message_text" TEXT NOT NULL,
    "status" "PendingSettlementStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_ledger_summaries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "party_identifier" TEXT NOT NULL,
    "total_debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "running_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "last_transaction_type" "LedgerEntryType",
    "last_recalculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_ledger_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_whatsapp_numbers_tenant_id_idx" ON "tenant_whatsapp_numbers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_whatsapp_numbers_phone_number_key" ON "tenant_whatsapp_numbers"("phone_number");

-- CreateIndex
CREATE INDEX "inventory_products_tenant_id_idx" ON "inventory_products"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_products_tenant_id_sku_key" ON "inventory_products"("tenant_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "customer_orders_source_whatsapp_message_id_key" ON "customer_orders"("source_whatsapp_message_id");

-- CreateIndex
CREATE INDEX "customer_orders_tenant_id_idx" ON "customer_orders"("tenant_id");

-- CreateIndex
CREATE INDEX "customer_orders_tenant_id_customer_whatsapp_idx" ON "customer_orders"("tenant_id", "customer_whatsapp");

-- CreateIndex
CREATE INDEX "order_details_order_id_idx" ON "order_details"("order_id");

-- CreateIndex
CREATE INDEX "order_details_product_id_idx" ON "order_details"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_source_whatsapp_message_id_key" ON "ledger_entries"("source_whatsapp_message_id");

-- CreateIndex
CREATE INDEX "ledger_entries_tenant_id_idx" ON "ledger_entries"("tenant_id");

-- CreateIndex
CREATE INDEX "ledger_entries_tenant_id_party_identifier_idx" ON "ledger_entries"("tenant_id", "party_identifier");

-- CreateIndex
CREATE UNIQUE INDEX "pending_settlements_source_whatsapp_message_id_key" ON "pending_settlements"("source_whatsapp_message_id");

-- CreateIndex
CREATE INDEX "pending_settlements_tenant_id_idx" ON "pending_settlements"("tenant_id");

-- CreateIndex
CREATE INDEX "pending_settlements_tenant_id_requested_by_status_idx" ON "pending_settlements"("tenant_id", "requested_by", "status");

-- CreateIndex
CREATE INDEX "financial_ledger_summaries_tenant_id_idx" ON "financial_ledger_summaries"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_ledger_summaries_tenant_id_party_identifier_key" ON "financial_ledger_summaries"("tenant_id", "party_identifier");

-- AddForeignKey
ALTER TABLE "tenant_whatsapp_numbers" ADD CONSTRAINT "tenant_whatsapp_numbers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_products" ADD CONSTRAINT "inventory_products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_details" ADD CONSTRAINT "order_details_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "customer_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_details" ADD CONSTRAINT "order_details_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "inventory_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reference_order_id_fkey" FOREIGN KEY ("reference_order_id") REFERENCES "customer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_settlements" ADD CONSTRAINT "pending_settlements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger_summaries" ADD CONSTRAINT "financial_ledger_summaries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
