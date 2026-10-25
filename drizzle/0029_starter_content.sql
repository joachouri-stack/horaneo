-- Starter : site multipage, 50 photos, réservations illimitées, paiement par carte,
-- nom de domaine pour la création, assistance WhatsApp, maintenance, protection,
-- création du logo et du favicon, service technique 24 h/24.
UPDATE plans SET
  features = features || '{"fullSite": true, "sitePages": true, "onlinePayment": true, "freeDomain": true,
    "whatsappSupport": true, "maintenance": true, "securityProtection": true,
    "logoCreation": true, "technicalSupport247": true}'::jsonb,
  limits = limits || '{"photos": 50, "onlineBookingsPerMonth": null}'::jsonb
  WHERE code = 'starter';
--> statement-breakpoint
-- Pro et Business comprennent tout le Starter.
UPDATE plans SET
  features = features || '{"freeDomain": true, "whatsappSupport": true, "maintenance": true,
    "securityProtection": true, "logoCreation": true, "technicalSupport247": true}'::jsonb
  WHERE code IN ('pro', 'business');
