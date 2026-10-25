-- Starter : site multipage, 50 photos, réservations illimitées, paiement par carte,
-- nom de domaine pour la création, assistance WhatsApp, maintenance et protection.
UPDATE plans SET
  features = features || '{"fullSite": true, "sitePages": true, "onlinePayment": true, "freeDomain": true,
    "whatsappSupport": true, "maintenance": true, "securityProtection": true}'::jsonb,
  limits = limits || '{"photos": 50, "onlineBookingsPerMonth": null}'::jsonb
  WHERE code = 'starter';
--> statement-breakpoint
-- Pro et Business comprennent tout le Starter.
UPDATE plans SET
  features = features || '{"freeDomain": true, "whatsappSupport": true, "maintenance": true,
    "securityProtection": true}'::jsonb
  WHERE code IN ('pro', 'business');
