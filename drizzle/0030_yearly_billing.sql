-- Facturation annuelle : prix Stripe annuel de chaque pack, périodicité des abonnements et des commandes.
ALTER TABLE "plans" ADD COLUMN "stripe_yearly_price_id" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "stripe_yearly_price_cents" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "billing_interval" "billing_interval" DEFAULT 'month' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "billing_interval" "billing_interval" DEFAULT 'month' NOT NULL;