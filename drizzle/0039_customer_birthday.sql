-- Offre d'anniversaire : la cliente donne son jour et son mois de naissance (jamais
-- l'année : minimisation des données) ; le jour J, l'entreprise lui envoie un e-mail
-- avec un code promo personnel.
--
-- Droits : customers, promo_codes et business_settings sont accordés table entière
-- à app_tenant et app_platform (0003, 0012) : les nouvelles colonnes en héritent,
-- aucun droit par colonne n'est à ajouter. Aucune nouvelle table : les règles
-- tenant_isolation et platform_access existantes s'appliquent.
ALTER TABLE "customers" ADD COLUMN "birth_month" smallint;
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "birth_day" smallint;
--> statement-breakpoint
-- Les deux vides, ou une date qui existe (le 29 février est permis).
ALTER TABLE "customers" ADD CONSTRAINT "customers_birthday" CHECK (("customers"."birth_month" is null and "customers"."birth_day" is null) or ("customers"."birth_month" between 1 and 12 and "customers"."birth_day" between 1 and (case when "customers"."birth_month" = 2 then 29 when "customers"."birth_month" in (4, 6, 9, 11) then 30 else 31 end)));
--> statement-breakpoint
-- Tâche du jour : les clientes de l'entreprise nées ce jour-là.
CREATE INDEX "customers_birthday_idx" ON "customers" USING btree ("business_id","birth_month","birth_day") WHERE "customers"."birth_month" is not null;
--> statement-breakpoint
-- Réglages de l'entreprise. Les valeurs par défaut 20 (%) et 30 (jours) sont celles de
-- DEFAULT_BIRTHDAY_OFFER (src/config/defaults.ts) : les garder identiques.
ALTER TABLE "business_settings" ADD COLUMN "birthday_offer_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "birthday_discount_percent" smallint DEFAULT 20 NOT NULL;
--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "birthday_offer_days" smallint DEFAULT 30 NOT NULL;
--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_birthday_percent" CHECK ("business_settings"."birthday_discount_percent" between 1 and 100);
--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_birthday_days" CHECK ("business_settings"."birthday_offer_days" between 1 and 90);
--> statement-breakpoint
-- Code promo personnel : utilisable par cette seule cliente (même entreprise, garanti par le lien).
ALTER TABLE "promo_codes" ADD COLUMN "customer_id" uuid;
--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_customer_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "promo_codes_customer_idx" ON "promo_codes" USING btree ("business_id","customer_id") WHERE "promo_codes"."customer_id" is not null;
