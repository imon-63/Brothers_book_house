-- Stock lots (FIFO cost batches) — each restock keeps its own কেনা দাম.
CREATE TABLE "stock_lots" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "unit_cost" DECIMAL(12,2),
    "sale_price" DECIMAL(12,2),
    "qty_in" INTEGER NOT NULL,
    "qty_left" INTEGER NOT NULL,
    "purchase_id" UUID,
    "note" TEXT,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_lots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_lots_qty_chk" CHECK ("qty_in" > 0 AND "qty_left" >= 0 AND "qty_left" <= "qty_in"),
    CONSTRAINT "stock_lots_source_chk" CHECK ("source" IN ('OPENING','PURCHASE','RESTOCK','RETURN','ADJUST')),
    CONSTRAINT "stock_lots_cost_chk" CHECK ("unit_cost" IS NULL OR "unit_cost" >= 0)
);
CREATE INDEX "stock_lots_product_id_received_at_idx" ON "stock_lots"("product_id", "received_at");
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "stock_lot_consumptions" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "order_id" UUID,
    "qty" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,2),
    "returned" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_lot_consumptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_lot_consumptions_qty_chk" CHECK ("qty" > 0 AND "returned" >= 0 AND "returned" <= "qty")
);
CREATE INDEX "stock_lot_consumptions_order_id_idx" ON "stock_lot_consumptions"("order_id");
CREATE INDEX "stock_lot_consumptions_lot_id_idx" ON "stock_lot_consumptions"("lot_id");
ALTER TABLE "stock_lot_consumptions" ADD CONSTRAINT "stock_lot_consumptions_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "stock_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_lot_consumptions" ADD CONSTRAINT "stock_lot_consumptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_lot_consumptions" ADD CONSTRAINT "stock_lot_consumptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: today's shelf becomes one OPENING batch per product at its current cost / price.
INSERT INTO "stock_lots" ("id", "product_id", "source", "unit_cost", "sale_price", "qty_in", "qty_left", "note", "received_at")
SELECT gen_random_uuid(), p.id, 'OPENING', p.cost_price, p.price, p.stock_on_hand, p.stock_on_hand, 'শুরুর স্টক (লট চালুর সময়)', COALESCE(p.created_at, now())
  FROM "products" p
 WHERE p.deleted_at IS NULL AND p.stock_on_hand > 0;
