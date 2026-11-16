-- Référencement : site déclaré à Google (Search Console) et fiche Google Business, faits par
-- l'équipe au démarrage, inclus dans les packs Pro et Business. Modifiable ensuite dans
-- Admin → Packs. Les valeurs par défaut (src/config/defaults.ts) sont déjà à jour.
UPDATE plans
SET features = features || '{"searchConsole": true, "googleBusiness": true}'::jsonb, updated_at = now()
WHERE code IN ('pro', 'business');
