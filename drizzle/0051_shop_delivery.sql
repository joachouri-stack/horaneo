CREATE TYPE "public"."shop_fulfillment" AS ENUM('pickup', 'delivery');--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "shop_pickup_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "shop_delivery_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "shop_delivery_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "shop_free_delivery_from_cents" integer;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "fulfillment" "shop_fulfillment" DEFAULT 'pickup' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "delivery_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "delivery_address_line1" text;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "delivery_address_line2" text;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "delivery_postal_code" text;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "delivery_city" text;--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_shop_fulfillment" CHECK ("business_settings"."shop_pickup_enabled" or "business_settings"."shop_delivery_enabled");--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_shop_fee" CHECK ("business_settings"."shop_delivery_fee_cents" >= 0);