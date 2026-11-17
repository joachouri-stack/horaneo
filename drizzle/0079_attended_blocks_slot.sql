-- Un rendez-vous marqué « venue » (en cours) occupe toujours son créneau : le
-- garde-fou anti-doublon le compte désormais avec les rendez-vous actifs.
-- Si des chevauchements existent déjà dans les données (créés avant cette
-- correction), l'ancien garde-fou est gardé tel quel plutôt que de bloquer la
-- mise à jour : le calcul des créneaux, lui, les compte dans tous les cas.
DO $$
BEGIN
  ALTER TABLE "appointments" DROP CONSTRAINT "appointments_no_overlap";
  ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_no_overlap"
    EXCLUDE USING gist (
      "tenant_id" WITH =,
      "staff_id" WITH =,
      tstzrange("starts_at", "blocked_until", '[)') WITH &&
    )
    WHERE ("status" IN ('pending_payment', 'confirmed', 'attended'));
EXCEPTION WHEN exclusion_violation THEN
  RAISE NOTICE 'appointments_no_overlap : chevauchements existants, ancien garde-fou conservé';
END $$;
