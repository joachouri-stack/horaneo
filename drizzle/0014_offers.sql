-- Étape 9 bis : historique des prix (prix barré honnête), promotions datées, cartes cadeaux,
-- avis Google en cache, réglages des cartes, fonctions des packs.
CREATE TYPE "public"."gift_card_status" AS ENUM('pending_payment', 'active', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."gift_card_transaction_kind" AS ENUM('purchase', 'redeem_online', 'redeem_on_site', 'credit_back');--> statement-breakpoint
CREATE TABLE "gift_card_transactions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid DEFAULT app_current_business() NOT NULL,
	"gift_card_id" uuid NOT NULL,
	"kind" "gift_card_transaction_kind" NOT NULL,
	"amount_cents" integer NOT NULL,
	"appointment_id" uuid,
	"created_by_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_cards" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid DEFAULT app_current_business() NOT NULL,
	"code_hash" char(64) NOT NULL,
	"code_last4" char(4) NOT NULL,
	"status" "gift_card_status" DEFAULT 'pending_payment' NOT NULL,
	"initial_cents" integer NOT NULL,
	"balance_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"purchaser_name" text NOT NULL,
	"purchaser_email" text NOT NULL,
	"recipient_name" text,
	"recipient_email" text,
	"message" text,
	"send_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_account_id" text,
	"paid_at" timestamp with time zone,
	"locale" text DEFAULT 'fr' NOT NULL,
	"sold_on_site" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_cards_business_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "gift_cards_amounts" CHECK ("gift_cards"."initial_cents" > 0 and "gift_cards"."balance_cents" >= 0 and "gift_cards"."balance_cents" <= "gift_cards"."initial_cents")
);
--> statement-breakpoint
CREATE TABLE "google_reviews" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"place_id" text NOT NULL,
	"rating" numeric(2, 1),
	"total" integer DEFAULT 0 NOT NULL,
	"reviews" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"url" text,
	"fetched_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_services" (
	"tenant_id" uuid NOT NULL,
	"business_id" uuid DEFAULT app_current_business() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	CONSTRAINT "promotion_services_promotion_id_service_id_pk" PRIMARY KEY("promotion_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid DEFAULT app_current_business() NOT NULL,
	"title" jsonb NOT NULL,
	"discount_type" "discount_type" NOT NULL,
	"discount_value" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_business_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "promotions_value" CHECK ("promotions"."discount_value" > 0),
	CONSTRAINT "promotions_percent" CHECK ("promotions"."discount_type" <> 'percent' or "promotions"."discount_value" < 100),
	CONSTRAINT "promotions_dates" CHECK ("promotions"."starts_on" <= "promotions"."ends_on")
);
--> statement-breakpoint
CREATE TABLE "service_price_history" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid DEFAULT app_current_business() NOT NULL,
	"service_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_price_history_price" CHECK ("service_price_history"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "gift_cards_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "gift_card_validity_months" smallint DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "gift_card_amounts" integer[] DEFAULT '{3000,5000,10000}' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "gift_card_min_cents" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "gift_card_max_cents" integer DEFAULT 50000 NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "google_place_id" text;--> statement-breakpoint
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_card_fk" FOREIGN KEY ("business_id","gift_card_id") REFERENCES "public"."gift_cards"("business_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_appointment_fk" FOREIGN KEY ("business_id","appointment_id") REFERENCES "public"."appointments"("business_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_reviews" ADD CONSTRAINT "google_reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_reviews" ADD CONSTRAINT "google_reviews_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_services" ADD CONSTRAINT "promotion_services_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_services" ADD CONSTRAINT "promotion_services_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_services" ADD CONSTRAINT "promotion_services_promotion_fk" FOREIGN KEY ("business_id","promotion_id") REFERENCES "public"."promotions"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_services" ADD CONSTRAINT "promotion_services_service_fk" FOREIGN KEY ("business_id","service_id") REFERENCES "public"."services"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_price_history" ADD CONSTRAINT "service_price_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_price_history" ADD CONSTRAINT "service_price_history_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_price_history" ADD CONSTRAINT "service_price_history_service_fk" FOREIGN KEY ("business_id","service_id") REFERENCES "public"."services"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_card_transactions_card_idx" ON "gift_card_transactions" USING btree ("gift_card_id","created_at");--> statement-breakpoint
CREATE INDEX "gift_card_transactions_appointment_idx" ON "gift_card_transactions" USING btree ("appointment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gift_cards_code_hash_key" ON "gift_cards" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "gift_cards_payment_intent_key" ON "gift_cards" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "gift_cards_tenant_created_idx" ON "gift_cards" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "google_reviews_tenant_idx" ON "google_reviews" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "promotion_services_service_idx" ON "promotion_services" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "promotions_tenant_dates_idx" ON "promotions" USING btree ("tenant_id","ends_on");--> statement-breakpoint
CREATE INDEX "service_price_history_service_idx" ON "service_price_history" USING btree ("service_id","starts_at");--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_gift_validity" CHECK ("business_settings"."gift_card_validity_months" between 1 and 60);--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_gift_range" CHECK ("business_settings"."gift_card_min_cents" > 0 and "business_settings"."gift_card_min_cents" <= "business_settings"."gift_card_max_cents");--> statement-breakpoint
-- ─── Historique des prix : rempli par la base à chaque création ou changement de prix ───
CREATE OR REPLACE FUNCTION app_record_service_price() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.price_cents IS DISTINCT FROM OLD.price_cents THEN
    INSERT INTO service_price_history (tenant_id, business_id, service_id, price_cents)
    VALUES (NEW.tenant_id, NEW.business_id, NEW.id, NEW.price_cents);
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER record_service_price AFTER INSERT OR UPDATE OF price_cents ON services
  FOR EACH ROW EXECUTE FUNCTION app_record_service_price();
--> statement-breakpoint
-- Reprise : le prix actuel de chaque prestation, depuis sa création.
INSERT INTO service_price_history (tenant_id, business_id, service_id, price_cents, starts_at)
SELECT tenant_id, business_id, id, price_cents, created_at FROM services;
--> statement-breakpoint
-- ─── Isolation par ligne ───
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'service_price_history', 'promotions', 'promotion_services', 'google_reviews',
    'gift_cards', 'gift_card_transactions'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY platform_access ON %I TO app_platform
         USING (app_current_business() IS NULL OR business_id = app_current_business())
         WITH CHECK (true)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_platform', t);
  END LOOP;
  -- Vitrine (prix, promotions, avis) : lisible par tout le site, modifiable par l'entreprise déclarée.
  FOREACH t IN ARRAY ARRAY['service_price_history', 'promotions', 'promotion_services', 'google_reviews'] LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO app_tenant
         USING (tenant_id = app_current_tenant()
                AND (app_current_business() IS NULL OR business_id = app_current_business()))
         WITH CHECK (tenant_id = app_current_tenant() AND business_id = app_current_business())', t);
  END LOOP;
  -- Cartes cadeaux : visibles uniquement par l'entreprise qui les a encaissées.
  FOREACH t IN ARRAY ARRAY['gift_cards', 'gift_card_transactions'] LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO app_tenant
         USING (tenant_id = app_current_tenant() AND business_id = app_current_business())
         WITH CHECK (tenant_id = app_current_tenant() AND business_id = app_current_business())', t);
  END LOOP;
  -- Entreprise remplie automatiquement (entreprise unique du site, à défaut de déclaration).
  FOREACH t IN ARRAY ARRAY[
    'service_price_history', 'promotions', 'promotion_services', 'gift_cards', 'gift_card_transactions'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER fill_business BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION app_fill_business()', t);
  END LOOP;
END
$$;
--> statement-breakpoint
GRANT SELECT ON service_price_history TO app_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON promotions TO app_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON promotion_services TO app_tenant;
--> statement-breakpoint
GRANT SELECT ON google_reviews TO app_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON gift_cards TO app_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT ON gift_card_transactions TO app_tenant;
--> statement-breakpoint
-- ─── Fonctions des packs (valeurs de src/config/defaults.ts) ───
UPDATE plans SET features = features || '{"promotions": false, "googleReviews": false, "giftCards": false}'::jsonb
  WHERE code = 'basic';
--> statement-breakpoint
UPDATE plans SET features = features || '{"promotions": true, "googleReviews": false, "giftCards": false}'::jsonb
  WHERE code = 'essentiel';
--> statement-breakpoint
UPDATE plans SET features = features || '{"promotions": true, "googleReviews": true, "giftCards": true}'::jsonb
  WHERE code = 'serenite';
