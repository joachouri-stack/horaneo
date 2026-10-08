ALTER TABLE "plans" ADD COLUMN "no_commitment_fee_cents" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "booking_twin_code" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "highlights" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "stripe_price_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "price_change_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "price_change_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "setup_fee_cents";--> statement-breakpoint
-- ─── Grille des six packs (valeurs de src/config/defaults.ts) ───
-- Fonctions : avis Google retirés de Vitrine ; chaque pack avec réservation reprend son jumeau « site seul ».
UPDATE plans SET features = (features - 'customDesign') || '{
  "contactForm": false, "kickoffCall": false, "copywriting": false, "photoRetouch": false,
  "businessSections": false, "seoPages": false, "searchConsole": false, "googleBusiness": false,
  "visibilityReport": false, "paymentLinks": false, "multilingual": false, "qrPoster": false}'::jsonb;
--> statement-breakpoint
UPDATE plans SET features = features || '{"monthlyUpdate": true}'::jsonb WHERE code = 'express';
--> statement-breakpoint
UPDATE plans SET features = features || '{"googleReviews": false, "contactForm": true}'::jsonb
  WHERE code = 'vitrine';
--> statement-breakpoint
UPDATE plans SET features = features || '{
  "localSeo": true, "contactButtons": true, "mobileReady": true, "sitePages": true, "contactForm": true}'::jsonb
  WHERE code = 'essentiel';
--> statement-breakpoint
UPDATE plans SET features = features || '{
  "contactForm": true, "kickoffCall": true, "copywriting": true, "photoRetouch": true,
  "businessSections": true, "seoPages": true, "searchConsole": true, "googleBusiness": true,
  "visibilityReport": true, "paymentLinks": true, "multilingual": true, "qrPoster": true,
  "stats": true, "monthlyUpdate": false}'::jsonb
  WHERE code = 'signature';
--> statement-breakpoint
UPDATE plans SET features = features || '{
  "localSeo": true, "contactButtons": true, "mobileReady": true, "sitePages": true,
  "contactForm": true, "kickoffCall": true, "copywriting": true, "photoRetouch": true,
  "businessSections": true, "seoPages": true, "searchConsole": true, "googleBusiness": true,
  "visibilityReport": true, "paymentLinks": true, "multilingual": true, "qrPoster": true}'::jsonb
  WHERE code = 'serenite';
--> statement-breakpoint
-- Nouveaux prix (sauf si l'admin les a déjà changés) : un nouveau prix Stripe sera créé pour les
-- prochaines souscriptions ; les abonnés gardent leur prix jusqu'à la fin de leur engagement.
UPDATE plans SET price_cents = 4900, stripe_price_id = NULL WHERE code = 'signature' AND price_cents = 3900;
--> statement-breakpoint
UPDATE plans SET price_cents = 7900, stripe_price_id = NULL WHERE code = 'serenite' AND price_cents = 6900;
--> statement-breakpoint
UPDATE plans SET description = description || '{"fr": "Un site à votre image"}'::jsonb WHERE code = 'signature';
--> statement-breakpoint
UPDATE plans SET description = description || '{"fr": "Un vrai site à vos couleurs, avec la réservation"}'::jsonb
  WHERE code = 'essentiel';
--> statement-breakpoint
-- Frais de création sans engagement (avec engagement : création offerte), jumeaux et lignes visibles.
UPDATE plans SET no_commitment_fee_cents = 4900, booking_twin_code = 'essentiel',
  highlights = '["onePage", "customDomain", "contactButtons", "photosServices", "monthlyUpdate", "hosting"]'
  WHERE code = 'express';
--> statement-breakpoint
UPDATE plans SET no_commitment_fee_cents = 14900, booking_twin_code = 'essentiel',
  highlights = '["everythingIn:express", "fullSite", "contactForm", "promotionsTestimonials", "photos", "monthlyUpdate"]'
  WHERE code = 'vitrine';
--> statement-breakpoint
UPDATE plans SET no_commitment_fee_cents = 24900, booking_twin_code = 'serenite',
  highlights = '["everythingIn:vitrine", "withYou", "google", "cardPayment", "multilingual", "careUpdates"]'
  WHERE code = 'signature';
--> statement-breakpoint
UPDATE plans SET highlights = '["basePage", "bookings", "agenda", "emailReminders", "photosServices"]'
  WHERE code = 'basic';
--> statement-breakpoint
UPDATE plans SET no_commitment_fee_cents = 14900,
  highlights = '["everythingIn:vitrine", "bookings", "onlinePayment", "sms", "customerSpace", "members"]'
  WHERE code = 'essentiel';
--> statement-breakpoint
UPDATE plans SET no_commitment_fee_cents = 24900,
  highlights = '["everythingIn:signature", "bookings", "sms", "loyalty", "stats", "members"]'
  WHERE code = 'serenite';
--> statement-breakpoint
-- Réglages remplacés par les frais propres à chaque pack.
DELETE FROM platform_settings WHERE key IN ('setup_fee_cents', 'no_commitment_setup_fee_cents');
--> statement-breakpoint
-- Abonnements en cours : prix Stripe actuel inconnu ici, relu au prochain événement Stripe.
UPDATE subscriptions SET stripe_price_id = NULL;
