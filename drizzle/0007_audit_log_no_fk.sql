ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_actor_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_tenant_id_tenants_id_fk";
