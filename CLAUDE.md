@AGENTS.md

# Règles du projet Horaneo

- Toute lecture ou écriture de données passe par `withTenant` ou `withPlatform` (`src/db/access.ts`). Ne jamais utiliser `appDb()` directement.
- Toute nouvelle table portant un `tenant_id` : activer et forcer RLS, ajouter les règles `tenant_isolation` et `platform_access` et les droits dans sa migration, puis mettre à jour `EXPECTED_TENANT_GRANTS` dans `tests/db/isolation.test.ts`.
- Aucun texte d'interface dans le code : tout passe par `messages/<langue>.json`.
- Ni nom du produit, ni domaine, ni prix, ni quota écrits en dur : configuration (`src/config/`) ou base.
- Jamais de règle « si métier = … » : tout passe par la configuration du tenant.
- Les droits sensibles (statut d'administratrice, double vérification) ne se modifient que via `withPlatform` ou les scripts : un garde-fou en base refuse tout autre accès.
