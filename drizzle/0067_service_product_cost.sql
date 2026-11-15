-- Coût de revient facultatif des prestations et des produits (statistiques de marge de la
-- gérante, jamais affiché à la clientèle). Droits déjà accordés par table : rien à ajouter.
ALTER TABLE "services" ADD COLUMN "cost_cents" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "cost_cents" integer;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_cost" CHECK ("services"."cost_cents" IS NULL OR "services"."cost_cents" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_cost" CHECK ("products"."cost_cents" IS NULL OR "products"."cost_cents" >= 0);