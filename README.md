# Horaneo

SaaS multi-tenant : chaque professionnel travaillant sur rendez-vous reçoit son propre site web, avec réservation et paiement d'acompte en ligne.

- Brief et décisions : [`docs/01-base-de-donnees.md`](docs/01-base-de-donnees.md)
- Avancement : étape 1 sur 14 (projet, base, configuration, traductions)

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

# 4. Créer les tables puis insérer les valeurs de départ (packs, réglages)
pnpm db:migrate
pnpm db:seed
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
  lib/               outils sans dépendance (redirection horaneo.fr…)
  proxy.ts           traitement de chaque requête (langue, domaines)
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

## Garde-fous de la base de données

Ces règles sont inscrites dans PostgreSQL lui-même et vérifiées par les tests (`tests/db/`) :

- **Pas de double réservation** : deux rendez-vous actifs d'un même membre ne peuvent pas se chevaucher (temps de battement compris).
- **Pas de mélange entre clients** : une donnée d'un tenant ne peut pas pointer vers une donnée d'un autre tenant.
- **Journal de l'administratrice** en ajout seul : impossible de modifier ou supprimer une ligne.
- Téléphones au format international, montants positifs, acompte ≤ total, adresses de site valides.

L'isolation complète par règles d'accès par ligne (RLS) arrive à l'étape 2.

## Déployer (VPS Hostinger + Coolify)

Le déploiement complet (image Docker, sauvegardes horaires vers R2, alertes, procédure de restauration) sera finalisé aux étapes 12 et 13. Le principe :

1. Dans Coolify, créer une base **PostgreSQL 16** sans port public.
2. Créer une application reliée au dépôt GitHub (branche `main`). Renseigner les variables de `.env.example`, avec l'adresse interne de la base dans `DATABASE_URL`.
3. Commande de construction : `pnpm install --frozen-lockfile && pnpm build`. Avant chaque mise en ligne : `pnpm db:migrate`. Démarrage : `pnpm start`.
4. Pointer `horaneo.com` et `horaneo.fr` vers l'application. `horaneo.fr` redirige automatiquement vers `horaneo.com/fr`.
