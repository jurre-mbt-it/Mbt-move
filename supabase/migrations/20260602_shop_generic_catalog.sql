-- ============================================================================
-- Shop: generieke productcatalogus (schema's + fysieke artikelen + diensten).
-- Puur additief: bestaande shop_products krijgen kind = PROGRAM en blijven
-- ongewijzigd werken. Idempotent geschreven (IF NOT EXISTS) waar mogelijk.
-- ============================================================================

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ProductKind" AS ENUM ('PROGRAM', 'PHYSICAL', 'SERVICE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "FulfillmentStatus" AS ENUM ('NONE', 'PENDING', 'SHIPPED', 'DELIVERED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable: shop_products — soort + artikel/dienst-velden
ALTER TABLE "shop_products"
  ADD COLUMN IF NOT EXISTS "kind"             "ProductKind" NOT NULL DEFAULT 'PROGRAM',
  ADD COLUMN IF NOT EXISTS "sku"              TEXT,
  ADD COLUMN IF NOT EXISTS "stockQty"         INTEGER,
  ADD COLUMN IF NOT EXISTS "requiresShipping" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "weightGrams"      INTEGER,
  ADD COLUMN IF NOT EXISTS "bookingUrl"       TEXT;

CREATE INDEX IF NOT EXISTS "shop_products_kind_idx" ON "shop_products"("kind");

-- AlterTable: shop_orders — verzending + afhandeling
ALTER TABLE "shop_orders"
  ADD COLUMN IF NOT EXISTS "shippingName"       TEXT,
  ADD COLUMN IF NOT EXISTS "shippingAddress"    TEXT,
  ADD COLUMN IF NOT EXISTS "shippingPostalCode" TEXT,
  ADD COLUMN IF NOT EXISTS "shippingCity"       TEXT,
  ADD COLUMN IF NOT EXISTS "shippingCountry"    TEXT,
  ADD COLUMN IF NOT EXISTS "shippingCents"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "fulfillmentStatus"  "FulfillmentStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "trackingUrl"        TEXT;

-- AlterTable: shop_order_items — aantal + variant
ALTER TABLE "shop_order_items"
  ADD COLUMN IF NOT EXISTS "quantity"  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "variantId" TEXT;

-- CreateTable: shop_product_variants
CREATE TABLE IF NOT EXISTS "shop_product_variants" (
    "id"         TEXT NOT NULL,
    "productId"  TEXT NOT NULL,
    "label"      TEXT NOT NULL,
    "sku"        TEXT,
    "priceCents" INTEGER,
    "stockQty"   INTEGER,
    "sortOrder"  INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shop_product_variants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "shop_product_variants_productId_idx" ON "shop_product_variants"("productId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "shop_product_variants"
    ADD CONSTRAINT "shop_product_variants_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "shop_order_items"
    ADD CONSTRAINT "shop_order_items_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "shop_product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- RLS — verplicht op elke nieuwe public-tabel (zie AGENTS.md). De anon-key zit
-- in de browserbundle; zonder RLS is shop_product_variants direct leesbaar/
-- schrijfbaar via de Supabase REST-API. Prisma draait als owner en bypasst RLS,
-- dus deny-all volstaat. Idempotent: opnieuw runnen is veilig.
-- ============================================================================

ALTER TABLE public.shop_product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "default_deny" ON public.shop_product_variants;
CREATE POLICY "default_deny" ON public.shop_product_variants FOR ALL TO public USING (false) WITH CHECK (false);
