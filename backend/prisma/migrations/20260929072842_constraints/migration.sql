-- ════════════════════════════════════════════════════════════════════════
--  Cholo · constraints Prisma can't express
--  Applied as its own migration right after the init migration
--  (see backend/prisma/migrations/*_constraints). Idempotent where possible.
-- ════════════════════════════════════════════════════════════════════════

-- ───────────── helpers ─────────────

-- Append-only guard: ledgers can be inserted, never updated or deleted.
CREATE OR REPLACE FUNCTION cholo_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (tried %). Write a reversing entry instead.', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'check_violation';
END $$;

-- ───────────── catalog ─────────────

ALTER TABLE products
  ADD CONSTRAINT products_price_nonneg        CHECK (price >= 0),
  ADD CONSTRAINT products_compare_gte_price   CHECK (compare_at_price IS NULL OR compare_at_price >= price),
  ADD CONSTRAINT products_cost_nonneg         CHECK (cost_price IS NULL OR cost_price >= 0),
  ADD CONSTRAINT products_tax_range           CHECK (tax_rate >= 0 AND tax_rate <= 100),
  ADD CONSTRAINT products_stock_nonneg        CHECK (stock_on_hand >= 0 AND stock_reserved >= 0),
  ADD CONSTRAINT products_reserved_lte_hand   CHECK (allow_backorder OR stock_reserved <= stock_on_hand),
  ADD CONSTRAINT products_pages_pos           CHECK (pages IS NULL OR pages > 0),
  ADD CONSTRAINT products_rating_range        CHECK (rating_avg >= 0 AND rating_avg <= 5),
  ADD CONSTRAINT products_subcat_differs      CHECK (subcategory_id IS NULL OR subcategory_id <> category_id);

-- Fast Bangla/English fuzzy search (title, author line, sku).
CREATE INDEX IF NOT EXISTS products_title_trgm    ON products USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_subtitle_trgm ON products USING gin (subtitle gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_live_idx      ON products (section_id, category_id) WHERE deleted_at IS NULL AND status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS products_low_stock_idx ON products (stock_on_hand) WHERE deleted_at IS NULL AND track_inventory;

CREATE INDEX IF NOT EXISTS authors_name_trgm   ON authors USING gin (name_bn gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_name_trgm ON customers USING gin (name gin_trgm_ops);

-- Category tree is at most 2 levels and a child lives in its parent's section.
CREATE OR REPLACE FUNCTION cholo_category_depth() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE p record;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  SELECT parent_id, section_id INTO p FROM categories WHERE id = NEW.parent_id;
  IF p.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'categories are max 2 levels deep' USING ERRCODE = 'check_violation';
  END IF;
  IF p.section_id <> NEW.section_id THEN
    RAISE EXCEPTION 'sub-category must belong to its parent''s section' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS categories_depth ON categories;
CREATE TRIGGER categories_depth BEFORE INSERT OR UPDATE OF parent_id, section_id ON categories
  FOR EACH ROW EXECUTE FUNCTION cholo_category_depth();

-- Only one primary image per product.
CREATE UNIQUE INDEX IF NOT EXISTS product_images_one_primary ON product_images (product_id) WHERE is_primary;

-- Timed deals: sane window, below the regular price, never overlapping.
ALTER TABLE product_deals
  ADD CONSTRAINT product_deals_window  CHECK (ends_at > starts_at),
  ADD CONSTRAINT product_deals_price   CHECK (deal_price > 0),
  ADD CONSTRAINT product_deals_no_overlap EXCLUDE USING gist (
    product_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (cancelled_at IS NULL);

ALTER TABLE bundles
  ADD CONSTRAINT bundles_price_nonneg      CHECK (price >= 0),
  ADD CONSTRAINT bundles_compare_gte_price CHECK (compare_at_price IS NULL OR compare_at_price >= price);
ALTER TABLE bundle_items ADD CONSTRAINT bundle_items_qty_pos CHECK (quantity > 0);

-- ───────────── inventory & purchasing ─────────────

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_nonzero  CHECK (qty_on_hand_delta <> 0 OR qty_reserved_delta <> 0),
  ADD CONSTRAINT stock_movements_balance  CHECK (balance_after >= 0);
DROP TRIGGER IF EXISTS stock_movements_append_only ON stock_movements;
CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION cholo_forbid_mutation();

ALTER TABLE purchases
  ADD CONSTRAINT purchases_amounts CHECK (subtotal >= 0 AND other_charges >= 0 AND total = subtotal + other_charges),
  ADD CONSTRAINT purchases_paid    CHECK (amount_paid >= 0 AND amount_paid <= total);
ALTER TABLE purchase_items
  ADD CONSTRAINT purchase_items_qty  CHECK (quantity > 0),
  ADD CONSTRAINT purchase_items_cost CHECK (unit_cost >= 0 AND line_total = quantity * unit_cost);

-- ───────────── customers ─────────────

ALTER TABLE customers  ADD CONSTRAINT customers_phone_e164 CHECK (phone ~ '^\+8801[3-9][0-9]{8}$');
ALTER TABLE users      ADD CONSTRAINT users_phone_e164     CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$');
ALTER TABLE users      ADD CONSTRAINT users_has_login      CHECK (email IS NOT NULL OR phone IS NOT NULL);

-- One default address per customer.
CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_one_default
  ON customer_addresses (customer_id) WHERE is_default AND deleted_at IS NULL;

-- Exactly one target on polymorphic rows.
ALTER TABLE wishlist_items ADD CONSTRAINT wishlist_items_one_target CHECK (num_nonnulls(product_id, bundle_id) = 1);
ALTER TABLE cart_items     ADD CONSTRAINT cart_items_one_target     CHECK (num_nonnulls(product_id, bundle_id) = 1),
                           ADD CONSTRAINT cart_items_qty_pos        CHECK (quantity > 0 AND quantity <= 99);
ALTER TABLE carts          ADD CONSTRAINT carts_owner               CHECK (num_nonnulls(customer_id, guest_token) >= 1);

-- ───────────── orders ─────────────

ALTER TABLE orders
  ADD CONSTRAINT orders_amounts_nonneg CHECK (
    items_subtotal >= 0 AND discount_total >= 0 AND shipping_fee >= 0 AND tax_total >= 0
    AND grand_total >= 0 AND amount_paid >= 0 AND amount_refunded >= 0
    AND courier_cost >= 0 AND gateway_fee >= 0 AND courier_loss >= 0),
  ADD CONSTRAINT orders_discount_lte_subtotal CHECK (discount_total <= items_subtotal),
  ADD CONSTRAINT orders_total_math CHECK (grand_total = items_subtotal - discount_total + shipping_fee + tax_total),
  ADD CONSTRAINT orders_refund_lte_paid CHECK (amount_refunded <= amount_paid),
  ADD CONSTRAINT orders_cancel_reason CHECK (status NOT IN ('CANCELLED', 'RETURNED') OR cancelled_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS orders_open_idx ON orders (placed_at DESC) WHERE status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'HANDED_TO_COURIER', 'OUT_FOR_DELIVERY');
CREATE INDEX IF NOT EXISTS orders_cod_due_idx ON orders (placed_at) WHERE payment_method = 'COD' AND payment_status = 'UNPAID' AND status <> 'CANCELLED';

ALTER TABLE order_items
  ADD CONSTRAINT order_items_one_target CHECK (
    (kind = 'PRODUCT' AND product_id IS NOT NULL AND bundle_id IS NULL) OR
    (kind = 'BUNDLE'  AND bundle_id  IS NOT NULL AND product_id IS NULL)),
  ADD CONSTRAINT order_items_qty      CHECK (quantity > 0 AND quantity_returned >= 0 AND quantity_returned <= quantity),
  ADD CONSTRAINT order_items_amounts  CHECK (unit_price >= 0 AND list_price >= 0 AND discount >= 0 AND line_total >= 0
                                             AND (unit_cost IS NULL OR unit_cost >= 0));
ALTER TABLE order_item_components ADD CONSTRAINT order_item_components_qty CHECK (quantity > 0);

-- ───────────── fulfilment & payments ─────────────

ALTER TABLE shipments
  ADD CONSTRAINT shipments_amounts CHECK (cod_amount >= 0 AND delivery_charge >= 0 AND return_charge >= 0);
-- One live shipment per order (cancelled/returned ones may stay as history).
CREATE UNIQUE INDEX IF NOT EXISTS shipments_one_active ON shipments (order_id) WHERE status NOT IN ('CANCELLED', 'RETURNED');

ALTER TABLE payments ADD CONSTRAINT payments_amounts CHECK (amount > 0 AND fee >= 0);
ALTER TABLE refunds  ADD CONSTRAINT refunds_amount   CHECK (amount > 0);

-- ───────────── accounting ─────────────

ALTER TABLE cash_transactions ADD CONSTRAINT cash_transactions_amount_pos CHECK (amount > 0);
DROP TRIGGER IF EXISTS cash_transactions_append_only ON cash_transactions;
CREATE TRIGGER cash_transactions_append_only BEFORE UPDATE OR DELETE ON cash_transactions
  FOR EACH ROW EXECUTE FUNCTION cholo_forbid_mutation();

ALTER TABLE financial_documents
  ADD CONSTRAINT financial_documents_credit_link CHECK (kind <> 'CREDIT_NOTE' OR reason IS NOT NULL);
-- Documents are immutable, except attaching the rendered PDF once.
CREATE OR REPLACE FUNCTION cholo_documents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'financial_documents are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.pdf_key IS NULL AND NEW.pdf_key IS NOT NULL
     AND (to_jsonb(NEW) - 'pdf_key') = (to_jsonb(OLD) - 'pdf_key') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'financial_documents are immutable; issue a credit note' USING ERRCODE = 'check_violation';
END $$;
DROP TRIGGER IF EXISTS financial_documents_immutable ON financial_documents;
CREATE TRIGGER financial_documents_immutable BEFORE UPDATE OR DELETE ON financial_documents
  FOR EACH ROW EXECUTE FUNCTION cholo_documents_guard();

ALTER TABLE document_counters ADD CONSTRAINT document_counters_positive CHECK (next_value > 0 AND padding BETWEEN 1 AND 12);

-- ───────────── promotions & shipping ─────────────

ALTER TABLE coupons
  ADD CONSTRAINT coupons_value CHECK (
    (type = 'PERCENT' AND value > 0 AND value <= 100) OR
    (type = 'FIXED' AND value > 0) OR
    (type = 'FREE_SHIPPING' AND value >= 0)),
  ADD CONSTRAINT coupons_window CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
  ADD CONSTRAINT coupons_limits CHECK ((usage_limit IS NULL OR usage_limit > 0) AND (per_customer_limit IS NULL OR per_customer_limit > 0) AND used_count >= 0);
ALTER TABLE coupon_targets ADD CONSTRAINT coupon_targets_one_target CHECK (num_nonnulls(section_code, category_id, product_id, bundle_id) = 1);
ALTER TABLE coupon_redemptions ADD CONSTRAINT coupon_redemptions_discount CHECK (discount >= 0);

ALTER TABLE shipping_zones ADD CONSTRAINT shipping_zones_amounts CHECK (fee >= 0 AND courier_cost >= 0 AND eta_min_days <= eta_max_days);
ALTER TABLE shipping_rules
  ADD CONSTRAINT shipping_rules_window CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
  ADD CONSTRAINT shipping_rules_shape  CHECK (
    (type = 'MIN_SUBTOTAL' AND min_subtotal IS NOT NULL AND min_subtotal > 0) OR
    (type = 'SECTION_ONLY' AND section_id IS NOT NULL) OR
    (type IN ('ANY_BUNDLE', 'CAMPAIGN_ALL')));

-- ───────────── reviews, chat ─────────────

ALTER TABLE product_reviews ADD CONSTRAINT product_reviews_rating CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE conversations   ADD CONSTRAINT conversations_owner    CHECK (num_nonnulls(customer_id, guest_token) >= 1);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_open_per_customer
  ON conversations (customer_id) WHERE status IN ('OPEN', 'PENDING') AND customer_id IS NOT NULL;

-- ───────────── audit ─────────────

DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION cholo_forbid_mutation();

-- ───────────── reporting views ─────────────

-- Live stock with availability and valuation (admin inventory screen).
CREATE OR REPLACE VIEW v_product_stock AS
SELECT p.id, p.sku, p.title, s.code AS section_code,
       p.stock_on_hand, p.stock_reserved,
       GREATEST(p.stock_on_hand - p.stock_reserved, 0)            AS stock_available,
       COALESCE(p.low_stock_threshold, 5)                           AS low_stock_threshold,
       (p.stock_on_hand <= COALESCE(p.low_stock_threshold, 5))      AS is_low,
       p.stock_on_hand * COALESCE(p.cost_price, 0)                  AS stock_value
FROM products p JOIN sections s ON s.id = p.section_id
WHERE p.deleted_at IS NULL;

-- Cash account balances (হিসাব › ক্যাশবুক).
CREATE OR REPLACE VIEW v_cash_balances AS
SELECT a.id, a.code, a.name, a.type,
       a.opening_balance
       + COALESCE(SUM(CASE WHEN t.direction = 'IN' THEN t.amount ELSE -t.amount END), 0) AS balance
FROM cash_accounts a LEFT JOIN cash_transactions t ON t.account_id = a.id
GROUP BY a.id;

-- Daily sales in Dhaka time (dashboard charts).
CREATE OR REPLACE VIEW v_daily_sales AS
SELECT (o.placed_at AT TIME ZONE 'Asia/Dhaka')::date AS day,
       count(*)                                         AS orders,
       sum(o.grand_total)                               AS revenue,
       sum(o.items_subtotal - o.discount_total - COALESCE(o.items_cost, 0)) FILTER (WHERE o.items_cost IS NOT NULL) AS gross_profit
FROM orders o
WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
GROUP BY 1;
