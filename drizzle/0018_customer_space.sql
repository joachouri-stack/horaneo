CREATE TYPE "public"."customer_channel" AS ENUM('email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."data_request_kind" AS ENUM('export', 'deletion');--> statement-breakpoint
CREATE TYPE "public"."data_request_status" AS ENUM('new', 'done', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."loyalty_event_kind" AS ENUM('visit', 'visit_reverted', 'manual_adjustment', 'reward_used');--> statement-breakpoint
CREATE TABLE "customer_data_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid DEFAULT app_current_business() NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" "data_request_kind" NOT NULL,
	"status" "data_request_status" DEFAULT 'new' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_login_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"channel" "customer_channel" NOT NULL,
	"identifier" text NOT NULL,
	"secret_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"failed_attempts" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"channel" "customer_channel" NOT NULL,
	"identifier" text NOT NULL,
	"token_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_events" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid DEFAULT app_current_business() NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" "loyalty_event_kind" NOT NULL,
	"points" integer NOT NULL,
	"appointment_id" uuid,
	"reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_events_points" CHECK ("loyalty_events"."points" <> 0)
);
--> statement-breakpoint
CREATE TABLE "loyalty_rewards" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid DEFAULT app_current_business() NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount_cents" integer,
	"visits_required" smallint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_rewards_amount" CHECK ("loyalty_rewards"."amount_cents" is null or "loyalty_rewards"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "loyalty_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "loyalty_visits_required" smallint DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "loyalty_reward_label" text;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "loyalty_reward_cents" integer;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "loyalty_reward_validity_days" smallint DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "beneficiary_name" text;--> statement-breakpoint
ALTER TABLE "customer_data_requests" ADD CONSTRAINT "customer_data_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_data_requests" ADD CONSTRAINT "customer_data_requests_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_data_requests" ADD CONSTRAINT "customer_data_requests_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_data_requests" ADD CONSTRAINT "customer_data_requests_customer_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_login_codes" ADD CONSTRAINT "customer_login_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_events" ADD CONSTRAINT "loyalty_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_events" ADD CONSTRAINT "loyalty_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_events" ADD CONSTRAINT "loyalty_events_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_events" ADD CONSTRAINT "loyalty_events_customer_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_events" ADD CONSTRAINT "loyalty_events_appointment_fk" FOREIGN KEY ("business_id","appointment_id") REFERENCES "public"."appointments"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_used_by_user_id_users_id_fk" FOREIGN KEY ("used_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_customer_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_data_requests_business_idx" ON "customer_data_requests" USING btree ("business_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_login_codes_secret_key" ON "customer_login_codes" USING btree ("secret_hash");--> statement-breakpoint
CREATE INDEX "customer_login_codes_identifier_idx" ON "customer_login_codes" USING btree ("tenant_id","identifier","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_sessions_token_key" ON "customer_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "customer_sessions_identifier_idx" ON "customer_sessions" USING btree ("tenant_id","identifier");--> statement-breakpoint
CREATE INDEX "loyalty_events_customer_idx" ON "loyalty_events" USING btree ("business_id","customer_id","created_at");--> statement-breakpoint
CREATE INDEX "loyalty_events_appointment_idx" ON "loyalty_events" USING btree ("appointment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_rewards_open_key" ON "loyalty_rewards" USING btree ("business_id","customer_id") WHERE "loyalty_rewards"."used_at" is null;--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_loyalty_visits" CHECK ("business_settings"."loyalty_visits_required" between 2 and 50);--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_loyalty_validity" CHECK ("business_settings"."loyalty_reward_validity_days" between 7 and 730);--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_loyalty_reward" CHECK ("business_settings"."loyalty_reward_cents" is null or "business_settings"."loyalty_reward_cents" > 0);--> statement-breakpoint
-- ─── Règles par ligne et droits ───
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customer_login_codes', 'customer_sessions', 'loyalty_events', 'loyalty_rewards', 'customer_data_requests'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_platform', t);
  END LOOP;
  -- Connexion des clientes : propre au site (une cliente peut l'être de plusieurs entreprises du site).
  FOREACH t IN ARRAY ARRAY['customer_login_codes', 'customer_sessions'] LOOP
    EXECUTE format('CREATE POLICY platform_access ON %I TO app_platform USING (true) WITH CHECK (true)', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO app_tenant
         USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())', t);
  END LOOP;
  -- Fidélité et demandes de données : visibles uniquement par l'entreprise déclarée, comme entre deux sites.
  FOREACH t IN ARRAY ARRAY['loyalty_events', 'loyalty_rewards', 'customer_data_requests'] LOOP
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
  END LOOP;
END
$$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON customer_login_codes TO app_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON customer_sessions TO app_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT ON loyalty_events TO app_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON loyalty_rewards TO app_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON customer_data_requests TO app_tenant;
--> statement-breakpoint
-- ─── Fonctions des packs (valeurs de src/config/defaults.ts) ───
UPDATE plans SET features = features || '{"customerSpace": false, "loyalty": false}'::jsonb WHERE code = 'basic';
--> statement-breakpoint
UPDATE plans SET features = features || '{"customerSpace": true, "loyalty": false}'::jsonb WHERE code = 'essentiel';
--> statement-breakpoint
UPDATE plans SET features = features || '{"customerSpace": true, "loyalty": true}'::jsonb WHERE code = 'serenite';
--> statement-breakpoint
-- Entreprises du site où une cliente est connue, par son e-mail ou son téléphone
-- exact (fiche cliente, ou carte cadeau reçue ou achetée pour l'e-mail).
-- Fonction sûre : elle ne renvoie que des identifiants d'entreprise, jamais les fiches.
CREATE OR REPLACE FUNCTION app_customer_businesses(p_tenant uuid, p_channel text, p_identifier text)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT business_id FROM (
    SELECT business_id FROM customers
      WHERE tenant_id = p_tenant
        AND ((p_channel = 'email' AND lower(email) = lower(p_identifier))
          OR (p_channel = 'sms' AND phone = p_identifier))
    UNION
    SELECT business_id FROM gift_cards
      WHERE tenant_id = p_tenant AND status = 'active' AND p_channel = 'email'
        AND (lower(purchaser_email) = lower(p_identifier) OR lower(recipient_email) = lower(p_identifier))
  ) AS known
  -- Seulement pour le site déclaré dans la transaction : jamais un autre tenant.
  WHERE p_tenant = app_current_tenant()
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_customer_businesses(uuid, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_customer_businesses(uuid, text, text) TO app_tenant, app_platform;
--> statement-breakpoint
-- Quotas du pack : seuls les membres et prestations actifs comptent (une fiche
-- archivée parce qu'elle a un historique ne bloque plus l'ajout d'une nouvelle).
CREATE OR REPLACE FUNCTION app_site_usage(p_tenant uuid, p_kind text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_kind
    WHEN 'services' THEN (SELECT count(*)::int FROM services WHERE tenant_id = p_tenant AND is_active)
    WHEN 'members' THEN (SELECT count(*)::int FROM staff_members WHERE tenant_id = p_tenant AND is_active)
  END
$$;
