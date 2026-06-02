-- AlterTable
ALTER TABLE "shop_orders" ADD COLUMN     "buyerName" TEXT,
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "invoicedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "shop_products" ADD COLUMN     "therapistId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "shop_orders_invoiceNumber_key" ON "shop_orders"("invoiceNumber");

-- AddForeignKey
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
