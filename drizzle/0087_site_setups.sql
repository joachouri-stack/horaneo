CREATE TABLE "site_setups" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone,
	"review_requested_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_setups" ADD CONSTRAINT "site_setups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ─── Mise en route : le client lit, envoie son questionnaire et valide son site ───
ALTER TABLE site_setups ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE site_setups FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON site_setups TO app_tenant
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
--> statement-breakpoint
CREATE POLICY platform_access ON site_setups TO app_platform USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON site_setups TO app_platform;
--> statement-breakpoint
GRANT SELECT, UPDATE ON site_setups TO app_tenant;
