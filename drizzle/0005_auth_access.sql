-- ═══════════════════════════════════════════════════════════════════════════
-- Accès des tables de connexion.
--
-- app_auth : rôle de Better Auth (connexion). Il est hérité automatiquement
-- par le rôle de connexion de l'application, car Better Auth ne peut pas
-- choisir un rôle à chaque requête. Il n'accède qu'aux tables de connexion,
-- jamais aux données des tenants, et ne peut pas donner le statut
-- d'administratrice ni valider une double vérification.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_auth') THEN
    CREATE ROLE app_auth NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_auth;
--> statement-breakpoint

GRANT SELECT, INSERT ON users TO app_auth;
--> statement-breakpoint
GRANT UPDATE (email, email_verified, name, image, locale, updated_at, last_login_at) ON users TO app_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_accounts, auth_verifications TO app_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON auth_sessions TO app_auth;
--> statement-breakpoint
GRANT UPDATE (token, expires_at, ip_address, user_agent, updated_at) ON auth_sessions TO app_auth;
--> statement-breakpoint

-- Le rôle plateforme accède aux nouvelles tables (espace admin, double vérification).
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_sessions, auth_accounts, auth_verifications, admin_two_factors TO app_platform;
--> statement-breakpoint

-- ─── Garde-fou : champs sensibles réservés à l'espace admin et aux scripts ───
-- Personne d'autre que le rôle plateforme ou le propriétaire de la base ne peut
-- créer une administratrice, activer sa double vérification ou marquer une
-- session comme vérifiée (même en insérant directement une ligne).
CREATE OR REPLACE FUNCTION app_is_privileged() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT current_user = 'app_platform'
      OR current_user = (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users')
      OR (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION users_protect_privileged_fields() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF app_is_privileged() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.is_platform_admin OR NEW.two_factor_enabled) THEN
    RAISE EXCEPTION 'champ réservé à l''administration' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin
                           OR NEW.two_factor_enabled IS DISTINCT FROM OLD.two_factor_enabled) THEN
    RAISE EXCEPTION 'champ réservé à l''administration' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER users_protect_privileged_fields
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_protect_privileged_fields();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION auth_sessions_protect_verification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF app_is_privileged() THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.two_factor_verified_at IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.two_factor_verified_at IS DISTINCT FROM OLD.two_factor_verified_at) THEN
    RAISE EXCEPTION 'champ réservé à l''administration' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER auth_sessions_protect_verification
  BEFORE INSERT OR UPDATE ON auth_sessions
  FOR EACH ROW EXECUTE FUNCTION auth_sessions_protect_verification();
