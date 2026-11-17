-- Pack Business : 100 SMS inclus par mois, comme le Pro (recharges de SMS en option au-delà).
-- Modifiable ensuite dans Admin → Packs. Les valeurs par défaut (src/config/defaults.ts) sont déjà à jour.
UPDATE plans
SET limits = limits || '{"smsPerMonth": 100}'::jsonb, updated_at = now()
WHERE code = 'business';
