-- Commandes du site commercial (étape 11) : abonnement payé avant la création du site.
ALTER TABLE "orders" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_subscription_key" ON "orders" USING btree ("stripe_subscription_id");