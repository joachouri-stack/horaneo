-- Pack Pro à 32,90 € HT par mois (39,48 € TTC avec la TVA à 20 %), un prix HT rond. Même effet
-- qu'un enregistrement dans Admin → Packs : le prix Stripe mensuel est recréé à la prochaine
-- souscription (le prix annuel suit) ; les abonnés en cours sont prévenus puis passent au nouveau
-- prix à la fin de leur engagement (tâche planifiée). Seulement si le pack est encore à 32,42 € :
-- un autre prix choisi dans l'admin n'est pas écrasé.
UPDATE plans
SET price_cents = 3290, stripe_price_id = NULL, updated_at = now()
WHERE code = 'pro' AND price_cents = 3242;
