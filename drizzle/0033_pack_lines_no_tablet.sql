-- Pro et Business : bouton de réservation pour les réseaux sociaux, suivi et gestion du fichier client.
UPDATE plans SET features = features || '{"socialBooking": true, "customerFollowUp": true}'::jsonb
  WHERE code IN ('pro', 'business');
--> statement-breakpoint
-- Business : gestion des stocks, export comptable et caisse NF525, annoncés (« Bientôt inclus »).
UPDATE plans SET
  features = features || '{"stockManagement": true, "accountingExport": true, "cashRegisterNf525": true}'::jsonb
  WHERE code = 'business';
--> statement-breakpoint
UPDATE platform_settings SET value = (
  SELECT jsonb_agg(DISTINCT k ORDER BY k) FROM (
    SELECT jsonb_array_elements_text(platform_settings.value) AS k
    UNION
    SELECT unnest(ARRAY['stockManagement', 'accountingExport', 'cashRegisterNf525'])
  ) keys
)
WHERE key = 'features_soon';
--> statement-breakpoint
-- Offre « tablette offerte » suspendue pour l'instant (réactivable dans Admin → Offres).
UPDATE launch_offers SET is_active = false, updated_at = now() WHERE code = 'business-tablet';
