ALTER TABLE "business_settings" ADD COLUMN "winback_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "winback_after_days" smallint DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "winback_discount_percent" smallint DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "winback_offer_days" smallint DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_winback_after" CHECK ("business_settings"."winback_after_days" between 30 and 365);--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_winback_percent" CHECK ("business_settings"."winback_discount_percent" between 0 and 100);--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_winback_days" CHECK ("business_settings"."winback_offer_days" between 1 and 90);