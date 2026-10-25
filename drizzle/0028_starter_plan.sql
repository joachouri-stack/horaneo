-- Plus de pack gratuit à la vente : le Starter (payant) prend la place du Basic.
-- Le Basic reste en base, hors vente : les sites qui l'ont le gardent, et il reçoit
-- les sites dont l'abonnement payant se termine (mis en pause tant qu'il n'est pas vendu).
INSERT INTO plans (code, name, description, price_cents, currency, interval, no_commitment_fee_cents,
  highlights, limits, features, is_public, sort_order)
SELECT 'starter',
  '{"fr": "Starter", "en": "Starter", "es": "Starter", "ru": "Starter"}'::jsonb,
  '{"fr": "L''essentiel pour bien démarrer"}'::jsonb,
  1999, currency, interval, no_commitment_fee_cents, highlights, limits, features, true, 1
FROM plans WHERE code = 'basic'
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
UPDATE plans SET is_public = false, sort_order = 0 WHERE code = 'basic';
