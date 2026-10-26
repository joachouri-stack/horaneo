-- Effacement des données d'une cliente à sa demande : la fiche reste (rendez-vous
-- passés, comptabilité) mais sans nom, coordonnées ni notes.
ALTER TABLE "customers" ADD COLUMN "anonymized_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_contact";
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_contact" CHECK ("customers"."email" is not null or "customers"."phone" is not null or "customers"."anonymized_at" is not null);
