CREATE TYPE "public"."shop_order_status" AS ENUM('pending_payment', 'paid', 'ready', 'collected', 'cancelled', 'expired', 'refunded');--> statement-breakpoint
CREATE TABLE "shop_order_items" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid DEFAULT app_current_business() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"stock_tracked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_order_items_quantity" CHECK ("shop_order_items"."quantity" > 0),
	CONSTRAINT "shop_order_items_price" CHECK ("shop_order_items"."unit_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shop_orders" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid DEFAULT app_current_business() NOT NULL,
	"status" "shop_order_status" DEFAULT 'pending_payment' NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_phone" text,
	"note" text,
	"total_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"stripe_account_id" text,
	"stripe_payment_intent_id" text,
	"stripe_refund_id" text,
	"paid_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"collected_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_orders_business_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "shop_orders_total" CHECK ("shop_orders"."total_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_order_fk" FOREIGN KEY ("business_id","order_id") REFERENCES "public"."shop_orders"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_order_items_order_idx" ON "shop_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_orders_payment_intent_key" ON "shop_orders" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "shop_orders_tenant_status_idx" ON "shop_orders" USING btree ("tenant_id","business_id","status","created_at");--> statement-breakpoint
-- Commandes de la boutique : visibles uniquement par l'entreprise qui les encaisse.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shop_orders', 'shop_order_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY platform_access ON %I TO app_platform
         USING (app_current_business() IS NULL OR business_id = app_current_business())
         WITH CHECK (true)', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO app_tenant
         USING (tenant_id = app_current_tenant() AND business_id = app_current_business())
         WITH CHECK (tenant_id = app_current_tenant() AND business_id = app_current_business())', t);
    EXECUTE format(
      'CREATE TRIGGER fill_business BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION app_fill_business()', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_platform', t);
  END LOOP;
END
$$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON shop_orders TO app_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT ON shop_order_items TO app_tenant;
