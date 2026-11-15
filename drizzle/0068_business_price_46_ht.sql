-- Pack Business à 46 € HT par mois (55,20 € TTC avec la TVA à 20 %), tant que ses outils IA sont
-- « Bientôt ». Même effet qu'un enregistrement dans Admin → Packs : le prix Stripe mensuel est
-- recréé à la prochaine souscription (le prix annuel suit) ; les abonnés en cours sont prévenus puis
-- passent au nouveau prix à la fin de leur engagement (tâche planifiée). Seulement si le pack est
-- encore à 79 € : un autre prix choisi dans l'admin n'est pas écrasé.
UPDATE plans
SET price_cents = 4600, stripe_price_id = NULL, updated_at = now()
WHERE code = 'business' AND price_cents = 7900;
