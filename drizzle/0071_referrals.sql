CREATE TYPE "public"."referral_status" AS ENUM('pending', 'rewarded', 'manual', 'cancelled');--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "referral_status" DEFAULT 'pending' NOT NULL,
	"reward_months" integer NOT NULL,
	"credit_cents" integer,
	"rewarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_months" CHECK ("referrals"."reward_months" >= 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "referrer_tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_order_key" ON "referrals" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "referrals_tenant_idx" ON "referrals" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_referrer_tenant_id_tenants_id_fk" FOREIGN KEY ("referrer_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- ─── Parrainages : la marraine lit les siens ; seul le rôle plateforme les écrit ───
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE referrals FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON referrals TO app_tenant
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
--> statement-breakpoint
CREATE POLICY platform_access ON referrals TO app_platform USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON referrals TO app_platform;
--> statement-breakpoint
GRANT SELECT ON referrals TO app_tenant;
