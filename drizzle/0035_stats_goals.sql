-- Objectifs du mois de chaque entreprise (statistiques de la gérante) : chiffre d'affaires, rendez-vous, nouvelles clientes.
ALTER TABLE "business_settings" ADD COLUMN "revenue_goal_cents" integer;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "appointments_goal" integer;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "new_customers_goal" integer;