# Horaneo

SaaS multi-tenant : chaque professionnel travaillant sur rendez-vous reçoit son propre site web, avec réservation et paiement d'acompte en ligne.

- Brief et décisions : [`docs/01-base-de-donnees.md`](docs/01-base-de-donnees.md)
- Avancement : étape 7 sur 14 (espace gérante)

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

# 5. (facultatif) Deux démos : http://institut-demo.localhost:3000 (Basic)
#    et http://spa-demo.localhost:3000 (Sérénité, site complet)
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
  components/site/   éléments des sites clients (en-tête, prestations, horaires…)
  modules/site/      données, ambiances, adresses des pages, référencement
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

## Sites des clients

Un seul modèle (bien-être et coiffure), en trois ambiances : **claire**, **sombre** et **nature**. Les couleurs viennent du client (logo, puis réglage dans l'admin). Les contrastes sont recalculés automatiquement pour que titres, textes et bouton « Réserver » restent lisibles (norme WCAG). La palette du SaaS n'est jamais utilisée sur un site client.

| Pack                | Site                                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basic               | **fiche d'une page** : logo, présentation, prestations, horaires, adresse, bouton « Réserver », et la signature « Site créé par … »                                         |
| Essentiel, Sérénité | **site complet** : accueil, prestations et tarifs, une page par catégorie, l'établissement et l'équipe, galerie, avis, infos pratiques (horaires, adresse, plan, téléphone) |

- Le bouton **« Réserver » reste toujours visible** : dans l'en-tête sur ordinateur, dans une barre fixe en bas de l'écran (avec « Appeler ») sur téléphone.
- Une page vide (pas de photos, pas d'avis…) n'apparaît pas dans le menu. L'administratrice peut aussi masquer une page (case « Page publiée »).
- **Pages légales** générées à partir des coordonnées du client : mentions légales (seul endroit où apparaît le nom du SaaS, comme hébergeur) et confidentialité. Ces textes sont des modèles **à faire valider juridiquement**.
- **Référencement local** : titre et description par page, adresse canonique sur le domaine principal, fiche « établissement local » pour Google (adresse, téléphone, horaires, coordonnées GPS), `sitemap.xml` et `robots.txt` propres à chaque site. Rien n'est indexé tant qu'un site n'est pas en ligne.
- **Rapidité** : pages préparées côté serveur (environ 30 ms en local), photos servies à la taille de l'écran en AVIF/WebP.
- **Aperçu** : un site « en création » n'est visible que par l'administratrice, avec le lien « Aperçu du site » de sa fiche (valable 1 heure, signé, jamais indexé).

## Réservation en ligne

Parcours sur le site du client (`/reserver`), **sans compte**, en 4 étapes : prestation(s) → créneau (membre ou « sans préférence », jour, heure) → coordonnées → acompte si activé.

| Règle (réglable par établissement)         | Défaut                                                  |
| ------------------------------------------ | ------------------------------------------------------- |
| Délai minimum avant le créneau             | 2 heures                                                |
| Réservation au plus tard                   | 60 jours à l'avance                                     |
| Intervalle entre deux créneaux             | 15 minutes                                              |
| Prestations par rendez-vous                | 3 maximum (durées additionnées)                         |
| Temps de battement                         | par prestation, 0 par défaut, invisible pour la cliente |
| Annulation et report en ligne              | gratuits jusqu'à 24 heures avant                        |
| Réservation temporaire pendant le paiement | 10 minutes                                              |

- Un créneau tient entièrement dans les horaires d'ouverture **et** ceux du membre, hors congés, fermetures et autres rendez-vous (battements compris). Avec plusieurs prestations, les battements s'additionnent en fin de rendez-vous.
- « Sans préférence » : membre le moins chargé ce jour-là (minutes réservées), puis l'ordre de l'équipe. Un seul membre réalise toutes les prestations d'un rendez-vous.
- Le créneau est **recalculé sur le serveur** au moment de réserver. La base refuse deux rendez-vous qui se chevauchent pour un même membre, même si deux clientes valident à la même seconde.
- **Pack Basic** : 5 réservations en ligne par mois, comptées au mois où elles sont prises (une annulation ne libère pas de place ; un report ne compte pas). Le compteur est atomique. Une fois la limite atteinte, la page affiche le téléphone, sans message d'erreur. Les ajouts manuels de la gérante ne comptent pas.
- **Acompte** (packs avec paiement en ligne) : 30 % ou montant fixe, calculé sur le total. Le créneau est retenu 10 minutes, puis libéré si le paiement n'aboutit pas. Le paiement Stripe arrive à l'étape 8.
- **Gestion par lien** : après la réservation, la cliente reçoit un lien personnel (`/rendez-vous/<jeton>`, jamais indexé). Il permet d'annuler ou de déplacer jusqu'au délai ; un report conserve l'acompte. Seule une empreinte du jeton est stockée. L'envoi de ce lien par e-mail arrive à l'étape 9.
- Fiche cliente retrouvée par l'e-mail (même établissement). Consentement aux offres facultatif et décoché par défaut.
- Anti-abus : nombre de tentatives limité par adresse IP, champ piège contre les robots. Le tenant est recalculé à partir du domaine, jamais fourni par le visiteur.
- Les fuseaux horaires et les changements d'heure sont gérés : les heures affichées sont celles de l'établissement.

## Espace gérante

Adresse : `/<langue>/espace` sur le domaine principal (un lien `/espace` sur le domaine d'un client y redirige). Pensé d'abord pour le téléphone : 5 onglets fixés en bas de l'écran.

| Onglet      | Contenu                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Aujourd'hui | rendez-vous du jour, statut (venue, absente), ajout manuel d'un rendez-vous avec créneaux libres proposés                       |
| Agenda      | vue jour ou semaine, par membre, blocage d'un créneau ou d'une période (congés, fermeture)                                      |
| Clientes    | recherche (nom, e-mail, téléphone même saisi « 06… »), fiche, historique, notes                                                 |
| Mon site    | prestations, horaires, photos (recadrage), témoignages ; les autres changements passent par une demande à l'équipe              |
| Plus        | statistiques du mois, équipe et horaires de chaque membre, règles de réservation, abonnement, demandes, aide (e-mail, WhatsApp) |

- Les ajouts manuels ne comptent pas dans le quota Basic. Les limites du pack (membres, photos, prestations) s'appliquent.
- Toutes les données passent par la base en rôle « établissement » : une gérante ne peut techniquement voir que son établissement.
- L'administratrice peut ouvrir l'espace d'un client (« Voir comme le client », 2FA obligatoire) ; chaque modification faite ainsi est tracée dans le journal (`impersonation.*`).
- Les demandes de modification envoyées par les gérantes arrivent dans `/admin/demandes`.
- Le remboursement de l'acompte lors d'une annulation sera ajouté avec Stripe (étape 8).

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
