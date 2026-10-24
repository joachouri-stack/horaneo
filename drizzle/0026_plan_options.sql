-- Options activables à la carte (réservation, paiement, SMS…) et refonte des packs (Essentiel, Business, Premium).
CREATE TABLE "plan_options" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"code" text NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"icon" text DEFAULT 'spark' NOT NULL,
	"price_cents" integer,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requires" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_options_price_positive" CHECK ("plan_options"."price_cents" is null or "plan_options"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tenant_options" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"stripe_subscription_item_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "option_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_options" ADD CONSTRAINT "tenant_options_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_options" ADD CONSTRAINT "tenant_options_option_id_plan_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."plan_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_options_code_key" ON "plan_options" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_options_tenant_option_key" ON "tenant_options" USING btree ("tenant_id","option_id");--> statement-breakpoint
-- ─── Catalogue des options : lu par tous, modifié par le rôle plateforme ───
GRANT SELECT ON plan_options TO app_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON plan_options TO app_platform;
--> statement-breakpoint
-- ─── Options d'un site : la gérante les voit (lecture seule) ; seul le rôle plateforme les change ───
ALTER TABLE tenant_options ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant_options FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant_options TO app_tenant
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
--> statement-breakpoint
CREATE POLICY platform_access ON tenant_options TO app_platform USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_options TO app_platform;
--> statement-breakpoint
GRANT SELECT ON tenant_options TO app_tenant;
--> statement-breakpoint
-- ─── Fonctions et limites apportées par les options actives d'un site ───
-- Ajoutées à celles du pack (plans.features || app_option_features(tenant)). Seules les
-- fonctions activées (true) sont reprises : une option n'en retire jamais au pack.
CREATE FUNCTION app_option_features(tenant uuid) RETURNS jsonb
  LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    FROM tenant_options o
    JOIN plan_options p ON p.id = o.option_id
    CROSS JOIN LATERAL jsonb_each(p.features) e
   WHERE o.tenant_id = tenant AND e.value = 'true'::jsonb
$$;
--> statement-breakpoint
CREATE FUNCTION app_option_limits(tenant uuid) RETURNS jsonb
  LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    FROM tenant_options o
    JOIN plan_options p ON p.id = o.option_id
    CROSS JOIN LATERAL jsonb_each(p.limits) e
   WHERE o.tenant_id = tenant
$$;
--> statement-breakpoint
-- ─── Anciens packs : plus proposés à la vente, les abonnés les gardent ───
-- Les trois nouveaux packs et les options sont ajoutés par `pnpm db:seed` (src/config/defaults.ts).
UPDATE plans SET is_public = false
  WHERE code IN ('basic', 'essentiel', 'serenite', 'express', 'vitrine', 'signature');
