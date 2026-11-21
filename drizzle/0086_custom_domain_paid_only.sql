-- Son propre nom de domaine : réservé aux packs payants (le pack gratuit garde son adresse
-- en sous-domaine). Les domaines déjà branchés ne sont pas supprimés ; seul l'ajout d'un
-- nouveau domaine est refusé. Modifiable ensuite dans Admin → Packs.
UPDATE plans
SET features = features || '{"customDomain": false}'::jsonb, updated_at = now()
WHERE price_cents <= 0;
--> statement-breakpoint
UPDATE plans
SET features = features || '{"customDomain": true}'::jsonb, updated_at = now()
WHERE price_cents > 0 AND is_public;
