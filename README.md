# Horaneo

SaaS multi-tenant : chaque professionnel travaillant sur rendez-vous reçoit son propre site web, avec réservation et paiement d'acompte en ligne.

- Brief et décisions : [`docs/01-base-de-donnees.md`](docs/01-base-de-donnees.md)
- Avancement : étape 4 sur 14 (espace admin : création d'un client, modèle, contenus, photos)

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

# 6. (facultatif) Se donner le statut d'administratrice
pnpm admin:grant votre@email.fr
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
  modules/           règles métier (clients, prestations, équipe, horaires, textes, photos, quotas)
  lib/admin/         actions de l'espace admin (droits revérifiés, journal)
  lib/storage/       stockage des fichiers (dossier local ou Cloudflare R2)
  lib/images/        préparation des photos, couleurs du logo
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

## Connexion et rôles

La connexion se fait sans mot de passe, sur `horaneo.com/fr/connexion` :

- **Lien magique** par e-mail, valable 15 minutes et utilisable une seule fois. En développement, sans clé Brevo, le lien s'affiche dans le terminal.
- **Google** : le bouton apparaît dès que `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont renseignés. Dans la console Google Cloud, l'adresse de retour à déclarer est `https://horaneo.com/api/auth/callback/google`.
- **Apple** : même principe avec `APPLE_CLIENT_ID` et `APPLE_CLIENT_SECRET`. Tant qu'ils sont vides, le bouton est masqué et rien d'autre n'est bloqué.

Une même adresse e-mail donne toujours le même compte, quel que soit le moyen de connexion utilisé.

| Rôle            | Comment on l'obtient                                                                 | Où           |
| --------------- | ------------------------------------------------------------------------------------ | ------------ |
| Gérante         | être rattachée à un établissement (table `memberships`, créée par l'administratrice) | `/fr/espace` |
| Administratrice | `pnpm admin:grant email` sur le serveur, jamais depuis le site                       | `/fr/admin`  |

**Espace admin** : à la première connexion, l'administratrice active la double vérification en scannant un QR code avec une application d'authentification (Google Authenticator…). Elle reçoit aussi 8 codes de secours. Ensuite, un code à 6 chiffres est demandé à chaque nouvelle session, puis toutes les 12 heures. Une personne qui n'est pas administratrice reçoit une page « introuvable ». Connexions, échecs et activations sont journalisés.

**Limitation des tentatives** : 5 liens magiques par adresse IP toutes les 15 minutes, et 5 codes de double vérification toutes les 5 minutes. Derrière Cloudflare, mettre `CLIENT_IP_HEADERS=cf-connecting-ip`.

**Protection dans la base** : Better Auth utilise un rôle (`app_auth`) limité aux tables de connexion. Un garde-fou dans la base l'empêche de donner le statut d'administratrice ou de valider une double vérification.

## Espace admin

Adresse : `horaneo.com/fr/admin` (administratrice avec double vérification).

| Écran             | Contenu                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accueil           | clients en ligne par pack, revenu mensuel estimé, nouveaux clients et résiliations du mois, alertes (sites en création, clients Basic au maximum de réservations) |
| Clients           | liste avec recherche (nom, adresse, ville, domaine) et filtres (pack, statut)                                                                                     |
| Nouveau client    | formulaire par étapes : coordonnées → métier et modèle → logo et couleurs → prestations → horaires → domaine                                                      |
| Fiche d'un client | statut (mise en ligne, suspension), changement de pack, utilisation du mois par rapport au pack, gérante et dernière connexion, adresses du site                  |
| Contenus          | coordonnées, modèle et ambiance, logo et couleurs (déduites du logo), prestations et catégories, équipe, horaires, textes des pages, photos, témoignages          |

- Toutes les actions revérifient les droits (administratrice + double vérification), s'exécutent dans une transaction et sont **inscrites au journal**.
- Les **limites du pack** s'appliquent aussi ici : prestations, membres et photos. Le domaine propre et les témoignages ne sont disponibles que dans les packs qui les incluent.
- Les règles métier sont dans `src/modules/`. Chaque fonction reçoit la transaction : la même fonction servira à l'espace gérante (étape 7), où la base garantit l'isolation.

### Photos

- Formats acceptés : JPEG, PNG, WebP, HEIC et AVIF, plus SVG pour le logo. Taille maximale : 10 Mo.
- Chaque photo est vérifiée (son vrai format, pas seulement son nom), redressée, débarrassée de ses données cachées (position GPS…), redimensionnée et convertie en WebP.
- Une photo retirée est conservée 7 jours (réglage `replaced_asset_retention_days`) et peut être restaurée. La suppression définitive des fichiers sera faite par une tâche planifiée (étape 9).
- Stockage : un dossier local `storage/` en développement, servi par `/media/…`. En production : Cloudflare R2 (variables `R2_*`, et `R2_PUBLIC_URL` pour un domaine public comme `media.horaneo.com`).

## Autres garde-fous de la base de données

Ces règles sont vérifiées par les tests (`tests/db/`) :

- **Pas de double réservation** : deux rendez-vous actifs d'un même membre ne peuvent pas se chevaucher (temps de battement compris).
- **Pas de lien entre clients** : une donnée d'un tenant ne peut pas pointer vers une donnée d'un autre tenant.
- **Journal de l'administratrice** en ajout seul : impossible de modifier ou supprimer une ligne, même pour l'espace admin. Il garde la trace des comptes et des clients supprimés.
- Téléphones au format international, montants positifs, acompte ≤ total, adresses de site valides.

## Déployer (VPS Hostinger + Coolify)

Le déploiement complet (image Docker, sauvegardes horaires vers R2, alertes, procédure de restauration) sera finalisé aux étapes 12 et 13. Le principe :

1. Dans Coolify, créer une base **PostgreSQL 16** sans port public.
2. Créer une application reliée au dépôt GitHub (branche `main`). Renseigner les variables de `.env.example`, avec l'adresse interne de la base dans `DATABASE_URL` (propriétaire) et `APP_DATABASE_URL` (rôle `app_runtime`, avec un long mot de passe aléatoire), ainsi que `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BREVO_API_KEY` et les variables `R2_*` du stockage des photos.
3. Commande de construction : `pnpm install --frozen-lockfile && pnpm build`. Avant chaque mise en ligne : `pnpm db:migrate && pnpm db:roles`. Démarrage : `pnpm start`.
4. Pointer `horaneo.com` et `horaneo.fr` vers l'application. `horaneo.fr` redirige automatiquement vers `horaneo.com/fr`.
5. Se donner le statut d'administratrice depuis le terminal Coolify : `pnpm admin:grant votre@email.fr`.
