-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'RED_FLAGGED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MediaType" ADD VALUE 'MUX';
ALTER TYPE "MediaType" ADD VALUE 'CLOUDFLARE_STREAM';

-- CreateTable
CREATE TABLE "shop_customers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "supabaseUserId" TEXT,
    "name" TEXT,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_products" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "programId" TEXT,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "vatRate" INTEGER NOT NULL DEFAULT 21,
    "level" "Difficulty",
    "durationWeeks" INTEGER,
    "bodyRegion" "BodyRegion"[],
    "heroImageUrl" TEXT,
    "previewVideoUrl" TEXT,
    "highlights" TEXT[],
    "intakeTags" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_orders" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "molliePaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "nameSnapshot" TEXT NOT NULL,

    CONSTRAINT "shop_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_entitlements" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "shop_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_intake_sessions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "status" "IntakeStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "answers" JSONB NOT NULL DEFAULT '{}',
    "redFlagged" BOOLEAN NOT NULL DEFAULT false,
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "recommendedProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_intake_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_customers_email_key" ON "shop_customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "shop_customers_supabaseUserId_key" ON "shop_customers"("supabaseUserId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_products_slug_key" ON "shop_products"("slug");

-- CreateIndex
CREATE INDEX "shop_products_status_idx" ON "shop_products"("status");

-- CreateIndex
CREATE UNIQUE INDEX "shop_orders_molliePaymentId_key" ON "shop_orders"("molliePaymentId");

-- CreateIndex
CREATE INDEX "shop_orders_customerId_idx" ON "shop_orders"("customerId");

-- CreateIndex
CREATE INDEX "shop_orders_status_idx" ON "shop_orders"("status");

-- CreateIndex
CREATE INDEX "shop_order_items_orderId_idx" ON "shop_order_items"("orderId");

-- CreateIndex
CREATE INDEX "shop_entitlements_customerId_idx" ON "shop_entitlements"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_entitlements_customerId_productId_key" ON "shop_entitlements"("customerId", "productId");

-- CreateIndex
CREATE INDEX "shop_intake_sessions_customerId_idx" ON "shop_intake_sessions"("customerId");

-- AddForeignKey
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "shop_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_entitlements" ADD CONSTRAINT "shop_entitlements_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "shop_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_entitlements" ADD CONSTRAINT "shop_entitlements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_entitlements" ADD CONSTRAINT "shop_entitlements_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "shop_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_intake_sessions" ADD CONSTRAINT "shop_intake_sessions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "shop_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_intake_sessions" ADD CONSTRAINT "shop_intake_sessions_recommendedProductId_fkey" FOREIGN KEY ("recommendedProductId") REFERENCES "shop_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- RLS — verplicht op elke nieuwe public-tabel (zie AGENTS.md).
-- De anon-key (NEXT_PUBLIC_SUPABASE_ANON_KEY) zit in de browserbundle; zonder
-- RLS zijn deze tabellen direct leesbaar/schrijfbaar via de Supabase REST-API,
-- buiten de app om. Prisma draait als owner/service_role en bypasst RLS, dus
-- deny-all volstaat voor de applicatie. Idempotent: opnieuw runnen is veilig.
-- ============================================================================

ALTER TABLE public.shop_customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_order_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_entitlements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_intake_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "default_deny" ON public.shop_customers;
CREATE POLICY "default_deny" ON public.shop_customers FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "default_deny" ON public.shop_products;
CREATE POLICY "default_deny" ON public.shop_products FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "default_deny" ON public.shop_orders;
CREATE POLICY "default_deny" ON public.shop_orders FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "default_deny" ON public.shop_order_items;
CREATE POLICY "default_deny" ON public.shop_order_items FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "default_deny" ON public.shop_entitlements;
CREATE POLICY "default_deny" ON public.shop_entitlements FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "default_deny" ON public.shop_intake_sessions;
CREATE POLICY "default_deny" ON public.shop_intake_sessions FOR ALL TO public USING (false) WITH CHECK (false);
