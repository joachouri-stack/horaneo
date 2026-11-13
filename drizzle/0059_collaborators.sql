ALTER TYPE "public"."membership_role" ADD VALUE 'collaborator';--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "permissions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "staff_member_id" uuid;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_staff_fk" FOREIGN KEY ("tenant_id","staff_member_id") REFERENCES "public"."staff_members"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_staff_key" ON "memberships" USING btree ("tenant_id","staff_member_id");