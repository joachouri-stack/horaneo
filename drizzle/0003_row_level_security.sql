-- ═══════════════════════════════════════════════════════════════════════════
-- Isolation des tenants : règles d'accès par ligne (Row Level Security).
--
-- Deux rôles sans connexion directe :
--   app_tenant   : ne voit QUE les lignes du tenant déclaré dans app.tenant_id
--   app_platform : voit tout (espace admin, reconnaissance des domaines…)
--
-- L'application se connecte avec un rôle de connexion (créé par
-- `pnpm db:roles`) qui n'hérite d'AUCUN droit : il doit choisir explicitement
-- app_tenant ou app_platform à chaque transaction. Un oubli dans le code
-- provoque donc une erreur, jamais une fuite.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_platform') THEN
    CREATE ROLE app_platform NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint

-- Personne d'autre que le propriétaire et ces deux rôles ne voit le schéma :
-- sans choisir un rôle, la connexion de l'application ne voit aucune table.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_tenant, app_platform;
--> statement-breakpoint

-- Tenant déclaré pour la transaction en cours (null si aucun : aucune ligne visible).
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;
--> statement-breakpoint

-- ─── Règles par ligne sur toutes les tables portant un tenant_id ───────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appointment_items', 'appointments', 'assets', 'audit_log', 'customers',
    'memberships', 'message_log', 'opening_hours', 'orders', 'payments',
    'promo_codes', 'redirects', 'refunds', 'service_categories', 'services',
    'site_pages', 'staff_members', 'staff_schedules', 'staff_services',
    'subscriptions', 'tenant_domains', 'tenant_settings', 'testimonials',
    'time_off', 'update_requests', 'usage_counters'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO app_tenant
         USING (tenant_id = app_current_tenant())
         WITH CHECK (tenant_id = app_current_tenant())', t);
    EXECUTE format(
      'CREATE POLICY platform_access ON %I TO app_platform USING (true) WITH CHECK (true)', t);
  END LOOP;
END
$$;
--> statement-breakpoint

-- La table des tenants elle-même : un tenant ne voit que sa propre ligne.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenants TO app_tenant
  USING (id = app_current_tenant()) WITH CHECK (id = app_current_tenant());
--> statement-breakpoint
CREATE POLICY platform_access ON tenants TO app_platform USING (true) WITH CHECK (true);
--> statement-breakpoint

-- ─── Droits du rôle app_tenant ───────────────────────────────────────────────
-- Lecture seule : réglages communs et ce que seule l'administratrice modifie.
GRANT SELECT ON
  plans, platform_settings, legal_documents,
  tenants, tenant_domains, memberships, subscriptions, redirects, site_pages
TO app_tenant;
--> statement-breakpoint

-- Lecture, ajout, modification (pas de suppression : traces à conserver).
GRANT SELECT, INSERT, UPDATE ON
  tenant_settings, usage_counters, payments, refunds, message_log, update_requests
TO app_tenant;
--> statement-breakpoint

-- Gestion complète : ce que la gérante et le parcours de réservation modifient.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  assets, service_categories, services, staff_members, staff_services,
  testimonials, opening_hours, staff_schedules, time_off,
  customers, promo_codes, appointments, appointment_items
TO app_tenant;
--> statement-breakpoint

-- Aucun droit pour app_tenant sur : users, orders, stripe_events, audit_log, backup_runs.

-- ─── Droits du rôle app_platform ─────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_platform;
--> statement-breakpoint

-- ─── Reconnaissance d'un site par son nom de domaine ─────────────────────────
-- Avant de connaître le tenant, il faut trouver à qui appartient un domaine.
-- Cette fonction ne renvoie que le strict nécessaire, sans ouvrir la table.
CREATE OR REPLACE FUNCTION app_resolve_hostname(lookup text)
RETURNS TABLE (
  tenant_id uuid,
  tenant_status tenant_status,
  hostname text,
  is_primary boolean,
  primary_hostname text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT d.tenant_id,
         t.status,
         d.hostname,
         d.is_primary,
         (SELECT p.hostname FROM tenant_domains p
           WHERE p.tenant_id = d.tenant_id AND p.is_primary AND p.status = 'active'
           LIMIT 1)
    FROM tenant_domains d
    JOIN tenants t ON t.id = d.tenant_id
   WHERE d.hostname = lower(lookup)
     AND d.status = 'active'
   LIMIT 1
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_resolve_hostname(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_resolve_hostname(text) TO app_tenant, app_platform;
