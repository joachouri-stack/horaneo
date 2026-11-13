-- Pack Starter : horaires de travail de chaque membre inclus (le pack compte 2 membres, et la
-- fonction était déjà utilisable). Modifiable ensuite dans Admin → Packs.
UPDATE plans
SET features = features || '{"staffPlanning": true}'::jsonb, updated_at = now()
WHERE code = 'starter';
