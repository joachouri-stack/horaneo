-- Taux de remplissage de l'équipe, chiffre d'affaires et marge par prestation et par produit :
-- fonction « performanceInsights », réservée au pack Business. Modifiable ensuite dans
-- Admin → Packs. Les valeurs par défaut (src/config/defaults.ts) sont déjà à jour.
UPDATE plans
SET features = features || '{"performanceInsights": true}'::jsonb, updated_at = now()
WHERE code = 'business';
