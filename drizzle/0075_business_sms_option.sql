-- Pack Business : aucun SMS inclus, les SMS sont en option (recharges), comme pour le Starter.
-- Modifiable ensuite dans Admin → Packs. Les valeurs par défaut (src/config/defaults.ts) sont déjà à jour.
UPDATE plans
SET limits = limits || '{"smsPerMonth": 0}'::jsonb, updated_at = now()
WHERE code = 'business';
