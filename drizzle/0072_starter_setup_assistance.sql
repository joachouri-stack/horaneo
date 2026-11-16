-- Accompagnement personnalisé à la prise en main : inclus dans tous les packs, Starter compris.
-- Modifiable ensuite dans Admin → Packs. Les valeurs par défaut (src/config/defaults.ts) sont déjà à jour.
UPDATE plans
SET features = features || '{"setupAssistance": true}'::jsonb, updated_at = now()
WHERE code = 'starter';
