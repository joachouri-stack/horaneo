-- Grille Basic, Pro, Business ; offre de lancement (tablette) ; compteurs de consommation mensuels.
CREATE TYPE "public"."launch_offer_claim_status" AS ENUM('reserved', 'pending_review', 'eligible', 'shipped', 'refused', 'cancelled');--> statement-breakpoint
CREATE TABLE "launch_offer_claims" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"offer_id" uuid NOT NULL,
	"order_id" uuid,
	"tenant_id" uuid,
	"user_id" uuid,
	"status" "launch_offer_claim_status" DEFAULT 'reserved' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "launch_offers" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"code" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"quota" integer NOT NULL,
	"requires_commitment" boolean DEFAULT true NOT NULL,
	"title" jsonb NOT NULL,
	"conditions" jsonb NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "launch_offers_quota" CHECK ("launch_offers"."quota" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quota_usage" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period" text NOT NULL,
	"key" text NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"extra" integer DEFAULT 0 NOT NULL,
	"warned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quota_usage_counts" CHECK ("quota_usage"."used" >= 0 and "quota_usage"."extra" >= 0)
);
--> statement-breakpoint
ALTER TABLE "launch_offer_claims" ADD CONSTRAINT "launch_offer_claims_offer_id_launch_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."launch_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "launch_offer_claims" ADD CONSTRAINT "launch_offer_claims_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "launch_offer_claims" ADD CONSTRAINT "launch_offer_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "launch_offers" ADD CONSTRAINT "launch_offers_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_usage" ADD CONSTRAINT "quota_usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "launch_offer_claims_order_key" ON "launch_offer_claims" USING btree ("offer_id","order_id");--> statement-breakpoint
CREATE INDEX "launch_offer_claims_status_idx" ON "launch_offer_claims" USING btree ("offer_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "launch_offers_code_key" ON "launch_offers" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "quota_usage_tenant_period_key" ON "quota_usage" USING btree ("tenant_id","period","key");--> statement-breakpoint
-- ─── Offres de lancement : réglées et attribuées par le rôle plateforme uniquement ───
GRANT SELECT, INSERT, UPDATE, DELETE ON launch_offers TO app_platform;
--> statement-breakpoint
ALTER TABLE launch_offer_claims ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE launch_offer_claims FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON launch_offer_claims TO app_tenant
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
--> statement-breakpoint
CREATE POLICY platform_access ON launch_offer_claims TO app_platform USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON launch_offer_claims TO app_platform;
--> statement-breakpoint
GRANT SELECT ON launch_offer_claims TO app_tenant;
--> statement-breakpoint
-- ─── Compteurs : la gérante les lit ; seul le rôle plateforme les fait avancer ───
ALTER TABLE quota_usage ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE quota_usage FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON quota_usage TO app_tenant
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
--> statement-breakpoint
CREATE POLICY platform_access ON quota_usage TO app_platform USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON quota_usage TO app_platform;
--> statement-breakpoint
GRANT SELECT ON quota_usage TO app_tenant;
--> statement-breakpoint
-- ─── Nombre de fiches clients du site (toutes entreprises confondues), pour le quota du Basic ───
CREATE OR REPLACE FUNCTION app_site_usage(p_tenant uuid, p_kind text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_kind
    WHEN 'services' THEN (SELECT count(*)::int FROM services WHERE tenant_id = p_tenant AND is_active)
    WHEN 'members' THEN (SELECT count(*)::int FROM staff_members WHERE tenant_id = p_tenant AND is_active)
    WHEN 'customers' THEN (SELECT count(*)::int FROM customers WHERE tenant_id = p_tenant)
  END
$$;
--> statement-breakpoint
-- ─── Nouvelle grille : le Basic est remplacé par le nouveau Basic (gratuit) ───
-- Les sites déjà au Basic en profitent (plus de réservations et de photos).
UPDATE plans SET
  is_public = true,
  sort_order = 1,
  description = description || '{"fr": "L''essentiel pour bien démarrer"}'::jsonb,
  highlights = '[]'::jsonb,
  limits = '{"onlineBookingsPerMonth": 10, "customers": 50, "members": 1, "photos": 10, "services": null,
    "smsPerMonth": 0, "aiChatConversations": 0, "whatsappConversations": 0, "aiTexts": 0, "aiImages": 0}'::jsonb,
  features = features || '{"onlineBooking": true, "customDomain": true, "mobileReady": true,
    "contactButtons": true, "localSeo": true, "selfEditing": true, "gallery": true, "customerFile": true,
    "helpCenter": true, "emailSupport": true}'::jsonb
  WHERE code = 'basic';
--> statement-breakpoint
-- Les packs Pro et Business sont ajoutés par `pnpm db:seed` ; les autres packs restent hors vente.
UPDATE plans SET is_public = false WHERE code IN ('site-essentiel', 'site-business', 'site-premium');
--> statement-breakpoint
-- Prix de la grille exprimés hors taxes, formule sans engagement proposée (sans frais de création).
UPDATE platform_settings SET value = '"HT"'::jsonb WHERE key = 'prices_display';
--> statement-breakpoint
UPDATE platform_settings SET value = 'true'::jsonb WHERE key = 'offer_no_commitment';
