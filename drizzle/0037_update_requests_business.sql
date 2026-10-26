-- Demandes de modification : rattachées à l'entreprise qui les envoie. Sur un
-- site à plusieurs entreprises, chaque gérante ne voit que les siennes.
ALTER TABLE "update_requests" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
-- Demandes existantes : l'entreprise de la gérante qui l'a envoyée, sinon l'entreprise principale du site.
UPDATE "update_requests" r SET business_id = m.business_id
  FROM memberships m
  WHERE m.user_id = r.created_by_user_id AND m.tenant_id = r.tenant_id;
--> statement-breakpoint
UPDATE "update_requests" r SET business_id = b.id
  FROM businesses b
  WHERE r.business_id IS NULL AND b.tenant_id = r.tenant_id AND b.is_primary;
--> statement-breakpoint
ALTER TABLE "update_requests" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "update_requests" ALTER COLUMN "business_id" SET DEFAULT app_current_business();
--> statement-breakpoint
ALTER TABLE "update_requests" ADD CONSTRAINT "update_requests_business_fk" FOREIGN KEY ("tenant_id","business_id") REFERENCES "public"."businesses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
DROP TRIGGER IF EXISTS fill_business ON update_requests;
--> statement-breakpoint
CREATE TRIGGER fill_business BEFORE INSERT ON update_requests FOR EACH ROW EXECUTE FUNCTION app_fill_business();
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON update_requests;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON update_requests TO app_tenant
  USING (tenant_id = app_current_tenant() AND business_id = app_current_business())
  WITH CHECK (tenant_id = app_current_tenant() AND business_id = app_current_business());
--> statement-breakpoint
DROP POLICY IF EXISTS platform_access ON update_requests;
--> statement-breakpoint
CREATE POLICY platform_access ON update_requests TO app_platform
  USING (app_current_business() IS NULL OR business_id = app_current_business())
  WITH CHECK (true);
