-- Pack Pro à 38,90 € TTC par mois : 32,42 € HT (TVA à 20 %, ajoutée par Stripe). Même effet qu'un
-- enregistrement dans Admin → Packs : le prix Stripe mensuel est recréé à la prochaine souscription
-- (le prix annuel suit, il est recalculé à partir du prix mensuel) ; les abonnés en cours sont
-- prévenus puis passent au nouveau prix à la fin de leur engagement (tâche planifiée). Seulement
-- si le pack est encore à l'ancien prix : un prix déjà changé dans l'admin n'est pas écrasé.
UPDATE plans
SET price_cents = 3242, stripe_price_id = NULL, updated_at = now()
WHERE code = 'pro' AND price_cents = 3990;
