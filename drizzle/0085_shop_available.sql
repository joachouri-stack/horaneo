-- Boutique en ligne : livrée (catalogue, commandes, paiement, stocks, livraison). Elle n'est
-- plus annoncée « Bientôt » sur le site commercial. Modifiable ensuite dans
-- Admin → Réglages → Fonctions annoncées « Bientôt ».
UPDATE platform_settings
SET value = value - 'commerce', updated_at = now()
WHERE key = 'features_soon';
