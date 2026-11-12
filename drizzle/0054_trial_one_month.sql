-- Essai gratuit porté à 1 mois (30 jours) à la première souscription. Réglage modifiable ensuite
-- dans Admin → Réglages. Sans réglage enregistré, la valeur par défaut (src/config/defaults.ts)
-- s'applique déjà.
UPDATE platform_settings SET value = '30'::jsonb, updated_at = now() WHERE key = 'trial_days';
