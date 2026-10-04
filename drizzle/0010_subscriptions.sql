-- Abonnements (étape 10) : changement de pack programmé, échecs de paiement, produit Stripe des packs.
DROP INDEX "subscriptions_tenant_idx";--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "stripe_product_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "scheduled_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "payment_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "last_payment_error" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_scheduled_plan_id_plans_id_fk" FOREIGN KEY ("scheduled_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_tenant_key" ON "subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_customer_key" ON "subscriptions" USING btree ("stripe_customer_id");