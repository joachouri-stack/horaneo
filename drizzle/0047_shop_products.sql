ALTER TYPE "public"."asset_kind" ADD VALUE 'product';--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid DEFAULT app_current_business() NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"price_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"stock_quantity" integer,
	"photo_asset_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_business_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "products_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "products_price" CHECK ("products"."price_cents" >= 0),
	CONSTRAINT "products_stock" CHECK ("products"."stock_quantity" IS NULL OR "products"."stock_quantity" >= 0)
);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_photo_fk" FOREIGN KEY ("tenant_id","photo_asset_id") REFERENCES "public"."assets"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_tenant_business_idx" ON "products" USING btree ("tenant_id","business_id","sort_order");
--> statement-breakpoint
-- Boutique (vitrine) : lisible par tout le site, modifiable par l'entreprise déclarée.
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE products FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY platform_access ON products TO app_platform
  USING (app_current_business() IS NULL OR business_id = app_current_business())
  WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY tenant_isolation ON products TO app_tenant
  USING (tenant_id = app_current_tenant()
         AND (app_current_business() IS NULL OR business_id = app_current_business()))
  WITH CHECK (tenant_id = app_current_tenant() AND business_id = app_current_business());
--> statement-breakpoint
CREATE TRIGGER fill_business BEFORE INSERT ON products FOR EACH ROW EXECUTE FUNCTION app_fill_business();
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO app_platform;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO app_tenant;
