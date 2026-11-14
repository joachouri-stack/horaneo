-- Offre tablette : plus de formule mensuelle avec engagement, l'offre se prend avec le paiement à
-- l'année. Conditions mises à jour seulement si elles n'ont pas été modifiées dans l'admin.
UPDATE launch_offers
SET conditions = jsonb_set(conditions, '{fr}', to_jsonb('Réservée aux 100 premiers abonnés Business éligibles, avec paiement à l''année. Une tablette par établissement, configurée par nos soins, expédiée après validation du premier paiement et des contrôles d''éligibilité. Livraison en France métropolitaine.'::text)),
    updated_at = now()
WHERE code = 'business-tablet'
  AND conditions->>'fr' = 'Réservée aux 100 premiers abonnés Business éligibles avec engagement de 12 mois. Une tablette par établissement, configurée par nos soins, expédiée après validation du premier paiement et des contrôles d''éligibilité. Livraison en France métropolitaine.';
