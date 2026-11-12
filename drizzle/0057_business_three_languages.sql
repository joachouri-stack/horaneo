-- Pack Business : 3 langues en plus du français (au lieu de 4). Modifiable ensuite dans
-- Admin → Packs. Les valeurs par défaut (src/config/defaults.ts) sont déjà à jour.
UPDATE plans
SET limits = jsonb_set(limits, '{extraLanguages}', '3'::jsonb), updated_at = now()
WHERE code = 'business' AND limits ? 'extraLanguages';
