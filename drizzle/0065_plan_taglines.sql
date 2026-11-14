-- Sous-titres des packs : pour qui est chaque pack, plutôt qu'une formule générale. Seulement si
-- le texte n'a pas été changé dans Admin → Packs (sinon, il est gardé). Les valeurs par défaut
-- (src/config/defaults.ts) sont déjà à jour.
UPDATE plans
SET description = jsonb_set(COALESCE(description, '{}'::jsonb), '{fr}', '"Pour les indépendants qui se lancent"'),
  updated_at = now()
WHERE code = 'starter' AND description->>'fr' = 'L''essentiel pour bien démarrer';
--> statement-breakpoint
UPDATE plans
SET description = jsonb_set(COALESCE(description, '{}'::jsonb), '{fr}', '"Pour les établissements avec une petite équipe"'),
  updated_at = now()
WHERE code = 'pro' AND description->>'fr' = 'Pour développer votre activité';
--> statement-breakpoint
UPDATE plans
SET description = jsonb_set(COALESCE(description, '{}'::jsonb), '{fr}', '"Pour les établissements avec une grande équipe"'),
  updated_at = now()
WHERE code = 'business' AND description->>'fr' = 'Pour automatiser et piloter votre activité';
