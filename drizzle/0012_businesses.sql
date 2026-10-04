-- ═══════════════════════════════════════════════════════════════════════════
-- Un site, une ou plusieurs entreprises (brief, section 5).
--
-- Le site (tenant) garde le domaine, le modèle, le logo, les pages, l'abonnement.
-- L'entreprise porte le SIRET, le compte Stripe, les membres, les prestations,
-- les horaires, l'agenda, le fichier clientes et les conditions d'annulation.
-- Chaque site existant reçoit une entreprise (reprise de ses données), et
-- l'isolation par ligne s'applique désormais aussi entre entreprises d'un site.
-- ═══════════════════════════════════════════════════════════════════════════

-- Entreprise déclarée pour la transaction en cours (null : vue « site », sans données privées).
CREATE OR REPLACE FUNCTION app_current_business() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.business_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"siret" text,
	"vat_number" text,
	"email" text,
	"phone" text,
	"address_line1" text,
	"postal_code" text,
	"city" text,
	"stripe_account_id" text,
	"stripe_charges_enabled" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_tenant_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_stripe_account_id_key" ON "businesses" USING btree ("stripe_account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_one_primary_key" ON "businesses" USING btree ("tenant_id") WHERE "businesses"."is_primary";
--> statement-breakpoint
CREATE INDEX "businesses_tenant_idx" ON "businesses" USING btree ("tenant_id");
--> statement-breakpoint
-- Reprise : chaque site existant devient un site à une seule entreprise (principale).
INSERT INTO businesses (tenant_id, name, legal_name, siret, vat_number, email, phone, stripe_account_id, stripe_charges_enabled, is_primary)
SELECT id, name, legal_name, siret, vat_number, email, phone, stripe_account_id, stripe_charges_enabled, true FROM tenants;
--> statement-breakpoint
-- Réglages de réservation : désormais par entreprise (la table est renommée, ses données gardées).
ALTER TABLE "tenant_settings" RENAME TO "business_settings";
--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
UPDATE "business_settings" s SET business_id = b.id FROM businesses b WHERE b.tenant_id = s.tenant_id;
--> statement-breakpoint
ALTER TABLE "business_settings" DROP CONSTRAINT "tenant_settings_pkey";
--> statement-breakpoint
ALTER TABLE "business_settings" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "business_settings" ADD PRIMARY KEY ("business_id");
--> statement-breakpoint
ALTER TABLE "business_settings" RENAME CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk" TO "business_settings_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "business_settings_tenant_idx" ON "business_settings" USING btree ("tenant_id");
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
UPDATE "memberships" x SET business_id = b.id FROM businesses b WHERE b.tenant_id = x.tenant_id;
--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "business_id" SET DEFAULT app_current_business();
--> statement-breakpoint
ALTER TABLE "service_categories" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
UPDATE "service_categories" x SET business_id = b.id FROM businesses b WHERE b.tenant_id = x.tenant_id;
--> statement-breakpoint
ALTER TABLE "service_categories" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "service_categories" ALTER COLUMN "business_id" SET DEFAULT app_current_business();
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
UPDATE "services" x SET business_id = b.id FROM businesses b WHERE b.tenant_id = x.tenant_id;
--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "business_id" SET DEFAULT app_current_business();
--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
UPDATE "staff_members" x SET business_id = b.id FROM businesses b WHERE b.tenant_id = x.tenant_id;
--> statement-breakpoint
ALTER TABLE "staff_members" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "staff_members" ALTER COLUMN "business_id" SET DEFAULT app_current_business();
--> statement-breakpoint
ALTER TABLE "staff_services" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
UPDATE "staff_services" x SET business_id = b.id FROM businesses b WHERE b.tenant_id = x.tenant_id;
--> statement-breakpoint
ALTER TABLE "staff_services" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "staff_services" ALTER COLUMN "business_id" SET DEFAULT app_current_business();
--> statement-breakpoint
ALTER TABLE "opening_hours" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
UPDATE "opening_hours" x SET business_id = b.id FROM businesses b WHERE b.tenant_id = x.tenant_id;
--> statement-breakpoint
ALTER TABLE "opening_hours" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "opening_hours" ALTER COLUMN "business_id" SET DEFAULT app_current_business();
--> statement-breakpoint
ALTER TABLE "staff_schedules" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
UPDATE "staff_schedules" x SET business_id = b.id FROM businesses b WHERE b.tenant_id = x.tenant_id;
--> statement-breakpoint
ALTER TABLE "staff_schedules" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "staff_schedules" ALTER COLUMN "business_id" SET DEFAULT app_current_business();
--> statement-breakpoint
ALTER TABLE "time_off" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
UPDATE "time_off" x SET business_id = b.id FROM businesses b WHERE b.tenant_id = x.tenant_id;
--> statement-breakpoint
ALTER TABLE "time_off" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "time_off" ALTER COLUMN "business_id" SET DEFAULT app_current_business();
--> statement-breakpoint
ALTER TABLE "appointment_items" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
UPDATE "appointment_items" x SET business_id = b.id FROM businesses b WHERE b.tenant_id = x.tenant_id;
--> statement-breakpoint
ALTER TABLE "appointment_items" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "appointment_items" ALTER COLUMN "business_id" SET DEFAULT app_current_business();
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
UPDATE "appointments" x SET business_id = b.id FROM businesses b WHERE b.tenant_id = x.tenant_id;
--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "business_id" SET DEFAULT app_current_business();
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
UPDATE "customers" x SET business_id = b.id FROM businesses b WHERE b.tenant_id = x.tenant_id;
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "business_id" SET DEFAULT app_current_business();
--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
UPDATE "promo_codes" x SET business_id = b.id FROM businesses b WHERE b.tenant_id = x.tenant_id;
--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "business_id" SET DEFAULT app_current_business();
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
UPDATE "payments" x SET business_id = b.id FROM businesses b WHERE b.tenant_id = x.tenant_id;
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "business_id" SET DEFAULT app_current_business();
--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
UPDATE "refunds" x SET business_id = b.id FROM businesses b WHERE b.tenant_id = x.tenant_id;
--> statement-breakpoint
ALTER TABLE "refunds" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "refunds" ALTER COLUMN "business_id" SET DEFAULT app_current_business();
--> statement-breakpoint
ALTER TABLE "message_log" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
UPDATE "message_log" x SET business_id = b.id FROM businesses b WHERE b.tenant_id = x.tenant_id;
--> statement-breakpoint
ALTER TABLE "message_log" ALTER COLUMN "business_id" SET DEFAULT app_current_business();
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_business_id_key" UNIQUE("business_id","id");
--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_business_id_key" UNIQUE("business_id","id");
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_key" UNIQUE("business_id","id");
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_key" UNIQUE("business_id","id");
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_business_staff_fk" FOREIGN KEY ("business_id","staff_id") REFERENCES "public"."staff_members"("business_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_business_service_fk" FOREIGN KEY ("business_id","service_id") REFERENCES "public"."services"("business_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "opening_hours" ADD CONSTRAINT "opening_hours_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_business_appointment_fk" FOREIGN KEY ("business_id","appointment_id") REFERENCES "public"."appointments"("business_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_business_service_fk" FOREIGN KEY ("business_id","service_id") REFERENCES "public"."services"("business_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_staff_fk" FOREIGN KEY ("business_id","staff_id") REFERENCES "public"."staff_members"("business_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_customer_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "message_log" ADD CONSTRAINT "message_log_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
DROP INDEX "customers_tenant_email_key";
--> statement-breakpoint
DROP INDEX "promo_codes_tenant_code_key";
--> statement-breakpoint
CREATE UNIQUE INDEX "customers_business_email_key" ON "customers" USING btree ("business_id",lower("email")) WHERE "customers"."email" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "promo_codes_business_code_key" ON "promo_codes" USING btree ("business_id",upper("code"));
--> statement-breakpoint
DROP INDEX "tenants_stripe_account_id_key";
--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "legal_name";
--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "siret";
--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "vat_number";
--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "stripe_account_id";
--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "stripe_charges_enabled";
--> statement-breakpoint
-- ─── Isolation par ligne ─────────────────────────────────────────────────
-- Entreprises : visibles par le site (pages publiques, choix de l'entreprise),
-- modifiables seulement par l'administratrice (SIRET, compte Stripe).
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE businesses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON businesses TO app_tenant
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
--> statement-breakpoint
CREATE POLICY platform_access ON businesses TO app_platform USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT ON businesses TO app_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON businesses TO app_platform;
--> statement-breakpoint
-- Données « vitrine » d'une entreprise (prestations, membres, horaires…) :
-- lisibles par tout le site (pages publiques), mais une entreprise déclarée ne
-- voit que les siennes, et seule l'entreprise déclarée peut les modifier.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'business_settings', 'service_categories', 'services', 'staff_members',
    'staff_services', 'opening_hours', 'staff_schedules', 'time_off'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO app_tenant
         USING (tenant_id = app_current_tenant()
                AND (app_current_business() IS NULL OR business_id = app_current_business()))
         WITH CHECK (tenant_id = app_current_tenant() AND business_id = app_current_business())', t);
  END LOOP;
END
$$;
--> statement-breakpoint
-- Données privées d'une entreprise (clientes, rendez-vous, paiements, codes promo) :
-- visibles uniquement par l'entreprise déclarée, comme entre deux sites.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers', 'appointments', 'appointment_items', 'payments', 'refunds', 'promo_codes'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO app_tenant
         USING (tenant_id = app_current_tenant() AND business_id = app_current_business())
         WITH CHECK (tenant_id = app_current_tenant() AND business_id = app_current_business())', t);
  END LOOP;
END
$$;
--> statement-breakpoint
-- Messages : ceux d'une entreprise pour elle seule, ceux du site (sans entreprise) pour le site.
DROP POLICY IF EXISTS tenant_isolation ON message_log;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON message_log TO app_tenant
  USING (tenant_id = app_current_tenant() AND business_id IS NOT DISTINCT FROM app_current_business())
  WITH CHECK (tenant_id = app_current_tenant() AND business_id IS NOT DISTINCT FROM app_current_business());
--> statement-breakpoint
-- ─── Fonctions sûres (lecture d'une seule information, sans exposer les lignes) ───

-- Entreprise unique d'un site (null s'il en a plusieurs) : choisie automatiquement.
CREATE OR REPLACE FUNCTION app_default_business(p_tenant uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(id))[1] END FROM businesses WHERE tenant_id = p_tenant
$$;
--> statement-breakpoint
-- Entreprise d'un rendez-vous retrouvé par son lien de gestion (empreinte), sur un site donné.
CREATE OR REPLACE FUNCTION app_manage_token_business(p_tenant uuid, p_hash text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_id FROM appointments WHERE tenant_id = p_tenant AND manage_token_hash = p_hash
$$;
--> statement-breakpoint
-- Quotas du pack, comptés au niveau du site (toutes entreprises confondues).
CREATE OR REPLACE FUNCTION app_site_usage(p_tenant uuid, p_kind text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_kind
    WHEN 'services' THEN (SELECT count(*)::int FROM services WHERE tenant_id = p_tenant)
    WHEN 'members' THEN (SELECT count(*)::int FROM staff_members WHERE tenant_id = p_tenant)
  END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_default_business(uuid), app_manage_token_business(uuid, text), app_site_usage(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_default_business(uuid), app_manage_token_business(uuid, text), app_site_usage(uuid, text) TO app_tenant, app_platform;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_current_business() TO app_tenant, app_platform, PUBLIC;
--> statement-breakpoint
-- Administratrice : quand une entreprise est déclarée (édition des prestations
-- d'une entreprise, événement Stripe d'un compte…), elle ne voit et ne touche
-- que les lignes de cette entreprise. Sans entreprise déclarée : tout le site.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'business_settings', 'service_categories', 'services', 'staff_members',
    'staff_services', 'opening_hours', 'staff_schedules', 'time_off',
    'customers', 'appointments', 'appointment_items', 'payments', 'refunds', 'promo_codes'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS platform_access ON %I', t);
    EXECUTE format(
      'CREATE POLICY platform_access ON %I TO app_platform
         USING (app_current_business() IS NULL OR business_id = app_current_business())
         WITH CHECK (true)', t);
  END LOOP;
END
$$;
--> statement-breakpoint
-- Site à une seule entreprise (le cas courant) : sans entreprise déclarée
-- (administratrice, tâches planifiées, événements Stripe), business_id prend
-- l'entreprise unique du site. Site à plusieurs entreprises : l'ajout est
-- refusé tant que l'entreprise n'est pas déclarée (jamais de choix au hasard).
CREATE OR REPLACE FUNCTION app_fill_business() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.business_id IS NULL THEN
    NEW.business_id := app_default_business(NEW.tenant_id);
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'memberships', 'business_settings', 'service_categories', 'services', 'staff_members',
    'staff_services', 'opening_hours', 'staff_schedules', 'time_off',
    'customers', 'appointments', 'appointment_items', 'payments', 'refunds', 'promo_codes', 'message_log'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS fill_business ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER fill_business BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION app_fill_business()', t);
  END LOOP;
END
$$;
