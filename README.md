# Horaneo

SaaS multi-tenant : chaque professionnel travaillant sur rendez-vous reçoit son propre site web, avec réservation et paiement d'acompte en ligne.

- Brief et décisions : [`docs/01-base-de-donnees.md`](docs/01-base-de-donnees.md)
- Avancement : étape 2 sur 14 (multi-tenant : reconnaissance du domaine, isolation des données)

## Technologies

| Rôle                                                                   | Outil                                         |
| ---------------------------------------------------------------------- | --------------------------------------------- |
| Application (site commercial, sites clients, espaces gérante et admin) | Next.js 16 (App Router), React 19, TypeScript |
| Base de données                                                        | PostgreSQL 16 + Drizzle ORM                   |
| Traductions                                                            | next-intl (fichiers dans `messages/`)         |
| Styles                                                                 | Tailwind CSS 4                                |
| Tests                                                                  | Vitest                                        |

## Installer en local

Prérequis : **Node.js 22**, **pnpm** (`corepack enable`), et **PostgreSQL 16** (installé sur la machine, ou lancé avec Docker).

```bash
# 1. Dépendances
pnpm install

# 2. Configuration : copier l'exemple puis l'adapter si besoin
cp .env.example .env

# 3. Base de données (avec Docker ; sinon créer les bases "horaneo" et "horaneo_test")
docker compose up -d

# 4. Créer les tables, le rôle de connexion de l'application, puis les valeurs de départ
pnpm db:migrate
pnpm db:roles
pnpm db:seed

# 5. (facultatif) Un institut de démonstration : http://institut-demo.localhost:3000
pnpm db:seed-demo
```

## Lancer

```bash
pnpm dev          # site en développement sur http://localhost:3000 (redirige vers /fr)
```

| Commande                                             | Rôle                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm test`                                          | tests automatiques (la base `TEST_DATABASE_URL` est vidée à chaque lancement) |
| `pnpm lint` / `pnpm typecheck` / `pnpm format:check` | vérifications du code                                                         |
| `pnpm build` puis `pnpm start`                       | version de production                                                         |
| `pnpm db:generate`                                   | crée une migration après une modification de `src/db/schema/`                 |
| `pnpm db:migrate`                                    | applique les migrations en attente                                            |
| `pnpm db:seed`                                       | insère les valeurs de départ (n'écrase jamais un réglage modifié)             |
| `pnpm db:studio`                                     | explorateur visuel de la base                                                 |

Ces vérifications (format, lint, types, tests, construction) tournent automatiquement sur GitHub à chaque pull request (`.github/workflows/ci.yml`).

## Organisation du code

```
messages/            textes de l'interface, un fichier par langue (fr.json…)
drizzle/             migrations SQL de la base (générées + garde-fous écrits à la main)
src/
  app/(platform)/    site commercial (puis espaces gérante et admin)
  components/brand/  logo : seul emplacement à remplacer par les fichiers définitifs
  config/            configuration (env.ts) et valeurs de départ (defaults.ts)
  db/schema/         structure de la base, rangée par famille de tables
  i18n/              langues, routage par langue, chargement des traductions
  app/(tenant)/sites/[tenantId]/  sites des clients (adresse interne, jamais visible)
  db/access.ts       withTenant / withPlatform : SEULE porte d'accès aux données
  lib/tenancy/       reconnaissance des domaines et aiguillage des requêtes
  proxy.ts           traitement de chaque requête (domaine, langue, redirections)
tests/               tests automatiques
```

## Configuration

Toutes les valeurs viennent de variables d'environnement (voir [`.env.example`](.env.example)). Aucune clé secrète n'est écrite dans le code. Le nom du produit (`PRODUCT_NAME`) et le domaine (`MAIN_DOMAIN`) ne sont jamais écrits en dur.

Les prix, quotas et fonctions des packs, ainsi que les réglages encore ouverts (HT/TTC, engagement, frais de création, délai de mise en ligne…), sont **en base de données**. Les valeurs de départ sont dans `src/config/defaults.ts` ; elles seront modifiables depuis l'espace admin.

## Ajouter une langue

Le français est livré. Pour activer par exemple l'anglais, **sans toucher au code** :

1. Copier `messages/fr.json` en `messages/en.json` et traduire les textes. Une clé absente est remplacée par le texte français.
2. Ajouter la langue dans la configuration : `ENABLED_LOCALES=fr,en`.
3. Redéployer. Le site commercial répond alors aussi sur `/en`, et le sélecteur de langue apparaît.

La construction du site échoue avec un message clair si une langue activée n'a pas son fichier de traduction.

## Multi-tenant : comment une requête trouve son site

| Adresse visitée                                                                | Résultat                                  |
| ------------------------------------------------------------------------------ | ----------------------------------------- |
| `horaneo.com/fr`                                                               | site commercial                           |
| `www.horaneo.com`, `horaneo.fr/…`                                              | redirection vers `horaneo.com` (ou `/fr`) |
| `nom.horaneo.com` ou domaine propre du client                                  | site du client                            |
| sous-domaine réservé (`admin`, `api`, `www`…) ou domaine inconnu               | 404                                       |
| domaine secondaire d'un client (ex. sous-domaine quand il a un domaine propre) | redirection vers son adresse principale   |
| `/espace` sur le domaine d'un client                                           | redirection vers `horaneo.com/espace`     |

Les domaines sont enregistrés dans la table `tenant_domains`. Le proxy (`src/proxy.ts`) reconnaît le domaine, puis réécrit la requête vers l'adresse interne `/sites/<identifiant>`. Un domaine reconnu reste en mémoire 60 secondes. En développement, `nom.localhost:3000` remplace `nom.horaneo.com`.

Un site en création (`draft`) ou supprimé répond 404. Un site suspendu affiche un message d'indisponibilité. Un site résilié reste en ligne pendant la période de conservation.

## Isolation des données

C'est PostgreSQL lui-même qui empêche un client de voir les données d'un autre, grâce aux règles d'accès par ligne (RLS, migration `drizzle/0003_row_level_security.sql`).

- L'application se connecte avec un rôle restreint (`APP_DATABASE_URL`) qui **n'a aucun droit par lui-même**. Le propriétaire de la base (`DATABASE_URL`) ne sert qu'aux migrations et aux scripts.
- Pour accéder aux données, le code passe obligatoirement par `src/db/access.ts` :
  - `withTenant(tenantId, …)` : la base ne montre et n'accepte que les lignes de ce tenant ;
  - `withPlatform(…)` : accès à tous les tenants, réservé à l'espace admin.
- Un oubli dans le code provoque une erreur, jamais une fuite.

Les tests `tests/db/isolation.test.ts` créent deux tenants avec une ligne dans chaque table. Ils vérifient, **table par table**, que l'un ne peut ni lire, ni modifier, ni supprimer, ni créer les données de l'autre. Ils contrôlent aussi la liste exacte des droits accordés.

**Règle pour toute nouvelle table portant un `tenant_id`** : dans sa migration, activer et forcer les règles par ligne, ajouter les deux règles `tenant_isolation` et `platform_access`, accorder les droits voulus à `app_tenant` et à `app_platform`, puis mettre à jour `EXPECTED_TENANT_GRANTS` dans le test. Les tests échouent tant que ce n'est pas fait.

## Autres garde-fous de la base de données

Ces règles sont vérifiées par les tests (`tests/db/`) :

- **Pas de double réservation** : deux rendez-vous actifs d'un même membre ne peuvent pas se chevaucher (temps de battement compris).
- **Pas de lien entre clients** : une donnée d'un tenant ne peut pas pointer vers une donnée d'un autre tenant.
- **Journal de l'administratrice** en ajout seul : impossible de modifier ou supprimer une ligne, même pour l'espace admin.
- Téléphones au format international, montants positifs, acompte ≤ total, adresses de site valides.

## Déployer (VPS Hostinger + Coolify)

Le déploiement complet (image Docker, sauvegardes horaires vers R2, alertes, procédure de restauration) sera finalisé aux étapes 12 et 13. Le principe :

1. Dans Coolify, créer une base **PostgreSQL 16** sans port public.
2. Créer une application reliée au dépôt GitHub (branche `main`). Renseigner les variables de `.env.example`, avec l'adresse interne de la base dans `DATABASE_URL` (propriétaire) et `APP_DATABASE_URL` (rôle `app_runtime`, avec un long mot de passe aléatoire).
3. Commande de construction : `pnpm install --frozen-lockfile && pnpm build`. Avant chaque mise en ligne : `pnpm db:migrate && pnpm db:roles`. Démarrage : `pnpm start`.
4. Pointer `horaneo.com` et `horaneo.fr` vers l'application. `horaneo.fr` redirige automatiquement vers `horaneo.com/fr`.
