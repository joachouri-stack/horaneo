-- Garde-fou anti-doublon : un même membre ne peut pas avoir deux rendez-vous
-- actifs (en attente de paiement ou confirmés) qui se chevauchent, temps de
-- battement compris. L'intervalle est fermé au début et ouvert à la fin :
-- un rendez-vous 10 h-11 h et un autre 11 h-12 h ne se chevauchent pas.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "staff_id" WITH =,
    tstzrange("starts_at", "blocked_until", '[)') WITH &&
  )
  WHERE ("status" IN ('pending_payment', 'confirmed'));
--> statement-breakpoint

-- Journal de l'administratrice : ajout seul, ni modification ni suppression.
CREATE OR REPLACE FUNCTION audit_log_is_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log est en ajout seul : % interdit', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_log_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();
--> statement-breakpoint
CREATE TRIGGER "audit_log_no_truncate"
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_is_append_only();
