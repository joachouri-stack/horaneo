-- Pause entre deux rendez-vous, réglée par la gérante (Réglages → Réservation) : temps gardé libre
-- après chaque rendez-vous. 0 = aucune pause (comportement d'avant).
ALTER TABLE "business_settings" ADD COLUMN "break_minutes" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_break" CHECK ("business_settings"."break_minutes" between 0 and 120);