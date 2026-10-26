-- Pack Pro : vente de cartes cadeaux sur le site (déjà incluse dans Business).
-- Nom de domaine inclus pour la création du site : Pro et Business seulement.
UPDATE plans SET features = features || '{"giftCards": true, "freeDomain": true}'::jsonb
  WHERE code IN ('pro', 'business');
--> statement-breakpoint
UPDATE plans SET features = features || '{"freeDomain": false}'::jsonb WHERE code = 'starter';
