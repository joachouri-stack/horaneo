-- Modèle « Atelier » : ambiance « blush », page de chaque entreprise (adresse et présentation),
-- pictogramme et mise en avant des catégories. Aucune nouvelle table : droits et règles inchangés.
ALTER TYPE "public"."site_theme" ADD VALUE 'blush';--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "profile" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "service_categories" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "service_categories" ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_tenant_slug_key" ON "businesses" USING btree ("tenant_id","slug");