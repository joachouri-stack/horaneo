-- Plus de formule avec engagement sur le mensuel : le client résilie quand il veut (fin du mois
-- en cours). Réglage modifiable ensuite dans Admin → Réglages (« Durée de l'engagement »). Les
-- abonnements déjà engagés gardent leur date de fin d'engagement. Sans réglage enregistré, la
-- valeur par défaut (src/config/defaults.ts) s'applique déjà.
UPDATE platform_settings SET value = '0'::jsonb, updated_at = now() WHERE key = 'commitment_months' AND value = '12'::jsonb;
