-- Pack Pro à un prix hors taxes rond : 32,90 € HT par mois (39,48 € TTC avec la TVA à 20 %,
-- ajoutée par Stripe). Même effet qu'un enregistrement dans Admin → Packs : le prix Stripe
-- mensuel est recréé à la prochaine souscription (le prix annuel suit) ; les abonnés en cours
-- sont prévenus puis passent au nouveau prix à la fin de leur engagement (tâche planifiée).
-- Seulement si le pack est encore au prix précédent : un prix déjà changé dans l'admin n'est
-- pas écrasé.
UPDATE plans
SET price_cents = 3290, stripe_price_id = NULL, updated_at = now()
WHERE code = 'pro' AND price_cents IN (3242, 3990);
