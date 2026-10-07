CREATE TABLE "manager_notification_reads" (
	"tenant_id" uuid NOT NULL,
	"business_id" uuid DEFAULT app_current_business() NOT NULL,
	"user_id" uuid NOT NULL,
	"seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manager_notification_reads_business_id_user_id_pk" PRIMARY KEY("business_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "manager_notification_reads" ADD CONSTRAINT "manager_notification_reads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_notification_reads" ADD CONSTRAINT "manager_notification_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_notification_reads" ADD CONSTRAINT "manager_notification_reads_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ─── Règles par ligne et droits : chaque entreprise ne voit que ses lectures ───
ALTER TABLE manager_notification_reads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE manager_notification_reads FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON manager_notification_reads TO app_platform;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON manager_notification_reads TO app_tenant;
--> statement-breakpoint
CREATE POLICY platform_access ON manager_notification_reads TO app_platform
  USING (app_current_business() IS NULL OR business_id = app_current_business())
  WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY tenant_isolation ON manager_notification_reads TO app_tenant
  USING (tenant_id = app_current_tenant() AND business_id = app_current_business())
  WITH CHECK (tenant_id = app_current_tenant() AND business_id = app_current_business());
--> statement-breakpoint
CREATE TRIGGER fill_business BEFORE INSERT ON manager_notification_reads
  FOR EACH ROW EXECUTE FUNCTION app_fill_business();
