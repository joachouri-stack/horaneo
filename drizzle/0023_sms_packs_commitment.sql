CREATE TYPE "public"."sms_pack_status" AS ENUM('pending_payment', 'paid', 'expired');--> statement-breakpoint
CREATE TABLE "sms_packs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" "sms_pack_status" DEFAULT 'pending_payment' NOT NULL,
	"quantity" integer NOT NULL,
	"remaining" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"stripe_checkout_session_id" text,
	"purchased_by_user_id" uuid,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_packs_quantities" CHECK ("sms_packs"."quantity" > 0 and "sms_packs"."remaining" >= 0 and "sms_packs"."remaining" <= "sms_packs"."quantity" and "sms_packs"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "usage_counters" ADD COLUMN "sms_from_packs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "with_commitment" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "with_commitment" boolean;--> statement-breakpoint
ALTER TABLE "sms_packs" ADD CONSTRAINT "sms_packs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_packs" ADD CONSTRAINT "sms_packs_purchased_by_user_id_users_id_fk" FOREIGN KEY ("purchased_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sms_packs_checkout_session_key" ON "sms_packs" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX "sms_packs_tenant_idx" ON "sms_packs" USING btree ("tenant_id","status","paid_at");--> statement-breakpoint
-- ─── Règles par ligne et droits : les packs de SMS ne se lisent que dans leur site ───
-- La gérante les voit (lecture seule) ; seul le rôle plateforme les crée et les consomme.
ALTER TABLE sms_packs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sms_packs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON sms_packs TO app_tenant
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
--> statement-breakpoint
CREATE POLICY platform_access ON sms_packs TO app_platform USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON sms_packs TO app_platform;
--> statement-breakpoint
GRANT SELECT ON sms_packs TO app_tenant;
--> statement-breakpoint
-- ─── Abonnements en cours : ils ont été souscrits avec l'engagement de l'époque ───
UPDATE subscriptions SET with_commitment = true WHERE commitment_ends_at IS NOT NULL;
--> statement-breakpoint
-- ─── Nouveaux quotas de SMS (valeurs de src/config/defaults.ts), sauf si l'admin les a déjà changés ───
UPDATE plans SET limits = jsonb_set(limits, '{smsPerMonth}', '100')
  WHERE code = 'essentiel' AND limits->>'smsPerMonth' = '30';
--> statement-breakpoint
UPDATE plans SET limits = jsonb_set(limits, '{smsPerMonth}', '300')
  WHERE code = 'serenite' AND limits->>'smsPerMonth' = '150';
