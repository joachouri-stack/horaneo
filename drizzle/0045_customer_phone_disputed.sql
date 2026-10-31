-- Téléphone contesté : une réservation en ligne a donné, pour la même adresse e-mail, un autre
-- numéro que celui de la fiche. On ne sait pas lequel est le bon (n'importe qui peut saisir
-- l'e-mail d'une autre), donc ce numéro ne permet plus de se connecter par SMS à l'espace de
-- la cliente tant que la gérante n'a pas vérifié la fiche. La connexion par e-mail reste possible.
ALTER TABLE customers ADD COLUMN phone_disputed boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_customer_businesses(p_tenant uuid, p_channel text, p_identifier text)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT business_id FROM (
    SELECT business_id FROM customers
      WHERE tenant_id = p_tenant
        AND ((p_channel = 'email' AND lower(email) = lower(p_identifier))
          OR (p_channel = 'sms' AND phone = p_identifier AND NOT phone_disputed))
    UNION
    SELECT business_id FROM gift_cards
      WHERE tenant_id = p_tenant AND status = 'active' AND p_channel = 'email'
        AND (lower(purchaser_email) = lower(p_identifier) OR lower(recipient_email) = lower(p_identifier))
  ) AS known
  -- Seulement pour le site déclaré dans la transaction : jamais un autre tenant.
  WHERE p_tenant = app_current_tenant()
$$;
