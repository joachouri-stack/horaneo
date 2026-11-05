CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid DEFAULT app_current_business() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"price_cents" integer,
	"stock_quantity" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_business_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "product_variants_price" CHECK ("product_variants"."price_cents" IS NULL OR "product_variants"."price_cents" >= 0),
	CONSTRAINT "product_variants_stock" CHECK ("product_variants"."stock_quantity" IS NULL OR "product_variants"."stock_quantity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_fk" FOREIGN KEY ("business_id","product_id") REFERENCES "public"."products"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id","sort_order");--> statement-breakpoint
-- Variantes (vitrine) : lisibles par tout le site, modifiables par l'entreprise déclarée.
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE product_variants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY platform_access ON product_variants TO app_platform
  USING (app_current_business() IS NULL OR business_id = app_current_business())
  WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY tenant_isolation ON product_variants TO app_tenant
  USING (tenant_id = app_current_tenant()
         AND (app_current_business() IS NULL OR business_id = app_current_business()))
  WITH CHECK (tenant_id = app_current_tenant() AND business_id = app_current_business());
--> statement-breakpoint
CREATE TRIGGER fill_business BEFORE INSERT ON product_variants FOR EACH ROW EXECUTE FUNCTION app_fill_business();
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON product_variants TO app_platform;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON product_variants TO app_tenant;
