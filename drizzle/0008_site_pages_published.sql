ALTER TABLE "site_pages" ALTER COLUMN "is_published" SET DEFAULT true;--> statement-breakpoint
UPDATE "site_pages" SET "is_published" = true;
