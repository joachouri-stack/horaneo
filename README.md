# Horaneo

SaaS multi-tenant : chaque professionnel travaillant sur rendez-vous reçoit son propre site web, avec réservation et paiement d'acompte en ligne.

- Brief et décisions : [`docs/01-base-de-donnees.md`](docs/01-base-de-donnees.md)
- Avancement : étape 11 sur 14 (site commercial, inscription et commande)

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

# 5. (facultatif) Démos : http://institut-demo.localhost:3000 (Basic),
#    http://spa-demo.localhost:3000 (Sérénité, site complet)
#    http://duo-demo.localhost:3000 (un site, deux entreprises)
#    et http://ma-beaute-demo.localhost:3000 (modèle Atelier ; photos : DEMO_PHOTOS_DIR=dossier)
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
| `pnpm db:deploy`                                     | `db:migrate` puis `db:seed` (lancé automatiquement par `pnpm start`)          |
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

## Un site, une ou plusieurs entreprises

Un site (tenant) porte le domaine, le modèle, le logo, les couleurs, les pages et l'abonnement. Une **entreprise** (table `businesses`, migration `drizzle/0012_businesses.sql`) porte le SIRET, le compte Stripe, la gérante, les prestations, l'équipe, les horaires, l'agenda, les clientes et les réglages de réservation (`business_settings`). La plupart des sites n'ont qu'une entreprise ; un institut partagé par deux indépendantes en a deux.

- Chaque table d'entreprise porte un `business_id`, rempli automatiquement avec l'entreprise déclarée (`app.business_id`), ou avec l'entreprise unique du site. Sur un site à plusieurs entreprises, rien n'est choisi au hasard : l'ajout est refusé tant que l'entreprise n'est pas déclarée.
- `withTenant(tenantId, fn, db, businessId)` : sans `businessId`, l'entreprise unique du site (aucune s'il y en a plusieurs) ; `null` : vue « site » (pages publiques : vitrine des deux, aucune donnée privée).
- Clientes, rendez-vous, paiements, codes promo : visibles **uniquement** par leur entreprise, comme entre deux sites. Prestations, équipe, horaires : lisibles par tout le site, modifiables seulement par leur entreprise.
- Site public : la cliente choisit d'abord « Avec qui ? » ; ensuite tout se passe dans l'entreprise choisie (acompte versé sur son compte Stripe). Le lien de gestion retrouve l'entreprise du rendez-vous.
- Chaque gérante entre dans sa propre entreprise. L'abonnement est réglé et géré par l'entreprise principale ; les quotas du pack (prestations, membres, photos, SMS) se comptent pour tout le site.
- Admin : onglet « Entreprises » d'un client (identité légale, ajout d'une entreprise avec sa gérante, « Voir son espace ») ; Prestations, Équipe et Horaires ont un sélecteur d'entreprise.
- Mentions légales : chaque entreprise avec son SIRET.

Tests : `tests/db/businesses.test.ts`.

## Modèles de site

- **wellness** : modèle sobre (claire, sombre, nature).
- **atelier** : institut avec une page par professionnelle (maquettes de Ma Beauté Institut). Ambiance conseillée : « Rose poudré » (`blush`). On le choisit dans l'admin, onglet Modèle.
  - Accueil : accroche avec fin en italique, chiffres clés, bandeau des soins, cartes des catégories (pictogramme, « dès … », filtre par professionnelle, catégories « Spécialité » en grand), les professionnelles, l'institut, les avis, horaires et adresse.
  - Page de chaque professionnelle : `/avec/<adresse>` (présentation, ses soins par catégorie, « Réserver avec … »).
  - Réservation : « Avec qui ? » (étape 1), soin, créneau, coordonnées, acompte « versé directement à … », puis « C'est confirmé » avec « Ajouter à mon agenda ».
  - Pied de page brun, nom en filigrane, réseaux sociaux, crédit facultatif, horaires résumés (« Lundi au vendredi », « Jeudi dès 9 h 30 »). Aucune marque du SaaS sur un site payant.
  - Pages L'institut, Prestations (par professionnelle), Infos pratiques au même style ; menu avec la page en cours soulignée ; apparition douce des sections au défilement (désactivée si la personne demande moins d'animations).
- Page « Conditions d'annulation » (`/conditions-annulation`, tous modèles) : délai et acompte lus dans les réglages de chaque entreprise.
- Tout se saisit dans l'admin : Entreprises → « Sa page sur le site » ; Prestations → pictogramme et « Spécialité » de chaque catégorie ; Textes → accroche, étiquette, chiffres clés, crédit ; Coordonnées → réseaux sociaux.

## Promotions, cartes cadeaux et avis Google (étape 9 bis)

Fonctions des packs (`src/config/defaults.ts`) : promotions datées dès Essentiel ; avis Google et cartes cadeaux en Sérénité.

**Promotions datées** (gérante : Plus → Promotions)

- Intitulé, prestations, pourcentage ou montant retiré, dates de début et de fin (incluses). Pendant la période : bandeau « offre du moment » en haut du site, prix barré à côté du prix réduit, prix réduit à la réservation (acompte compris). Arrêt automatique à la date de fin.
- Prix barré honnête : le prix le plus bas pratiqué dans les 30 jours avant la promotion. La base enregistre chaque changement de prix (`service_price_history`, rempli par un déclencheur). Si la réduction n'est pas réelle, la promotion n'est pas affichée.
- Pas de cumul : un code promo ne s'ajoute pas à une prestation en promotion.

**Cartes cadeaux** (site : `/carte-cadeau` ; gérante : Plus → Cartes cadeaux)

- Achat en ligne : montants proposés ou libre (limites réglables), destinataire, message, envoi tout de suite ou à une date (9 h, heure de l'établissement). Paiement sur le compte Stripe de l'entreprise (aucune commission). Sur un site à plusieurs entreprises, on choisit chez qui : la carte n'est utilisable que chez elle.
- Code de 12 caractères calculé à partir de l'identifiant et de la clé secrète (jamais stocké en clair : seulement son empreinte et ses 4 derniers caractères).
- En ligne, la carte remplace l'acompte (débité de la carte) ; annulation dans le délai : le montant revient sur la carte ; report : il suit le rendez-vous. Sur place : la gérante saisit le code et le montant ; le solde est conservé.
- Réglages par entreprise : proposer ou non, validité (12 mois par défaut), montants. Règles affichées à l'achat et dans les conditions de vente (`/conditions-annulation`).

**Avis Google**

- Une clé Horaneo pour tous les sites : `GOOGLE_PLACES_API_KEY` (Google Cloud → activer « Places API (New) » → créer une clé, la restreindre à cette API). L'administratrice renseigne la fiche Google (identifiant « place ») de chaque entreprise (onglet Entreprises).
- La tâche planifiée relit chaque fiche une fois par jour au plus (note, nombre d'avis, 5 avis récents, lien) ; le site affiche cette copie, jamais modifiée, avec son origine et le lien vers tous les avis. Si Google ne répond pas : dernière copie gardée (30 jours au plus), sinon lien seul. Sans clé : seulement le lien.
- Note en tête de l'accueil, section d'avis ; page de chaque professionnelle avec ses propres avis si elle a sa fiche. Les témoignages saisis à la main restent affichés à part.

Tests : `tests/db/offers.test.ts`, `tests/offers-units.test.ts`.

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
- Une photo retirée est conservée 7 jours (réglage `replaced_asset_retention_days`) et peut être restaurée. Ensuite, la tâche planifiée la supprime définitivement.
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
- **Acompte** (packs avec paiement en ligne) : 30 % ou montant fixe, calculé sur le total (après code promo). Le créneau est retenu 10 minutes, puis libéré si le paiement n'aboutit pas (voir « Paiements des acomptes »).
- **Gestion par lien** : après la réservation, la cliente reçoit un lien personnel (`/rendez-vous/<jeton>`, jamais indexé). Il permet d'annuler ou de déplacer jusqu'au délai ; un report conserve l'acompte. Seule une empreinte du jeton est stockée. Ce lien figure dans la confirmation et les rappels envoyés par e-mail.
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
- En annulant un rendez-vous dont l'acompte est payé, la gérante choisit de le rembourser ou non.

## Paiements des acomptes (Stripe Connect)

L'argent va **directement sur le compte Stripe du professionnel** (comptes Stripe « Standard », paiements directs). La plateforme ne touche pas les fonds ; sa commission est un réglage (`deposit_commission_percent`), à 0.

| Qui           | Ce qui se passe                                                                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gérante       | « Plus → Paiements en ligne » : bouton « Ouvrir mon compte Stripe », puis étapes guidées chez Stripe (identité, activité, compte bancaire). Le nom de l'établissement apparaît sur le relevé de la cliente. |
| Cliente       | Après ses coordonnées, elle paie l'acompte par carte (Apple Pay et Google Pay compris) sans quitter le site. Un compte à rebours montre les 10 minutes de réservation du créneau.                           |
| Remboursement | Automatique si la cliente annule dans le délai. Au choix de la gérante quand c'est elle qui annule. Conservé si la cliente est absente ou hors délai. Un report garde l'acompte.                            |

- L'acompte n'est demandé que si les trois conditions sont réunies : pack avec paiement en ligne, acompte activé dans les réglages, compte Stripe actif. Sinon la réservation se fait sans acompte.
- Le rendez-vous est confirmé dès que le paiement aboutit, que l'information arrive par le navigateur ou par Stripe (la cliente peut fermer la page). Un paiement arrivé après les 10 minutes reprend le créneau s'il est encore libre, sinon il est **remboursé automatiquement**.
- Si Stripe refuse un remboursement, l'annulation n'est pas faite et un message invite à réessayer : jamais d'annulation « à moitié ».
- Un remboursement fait directement depuis le tableau de bord Stripe du professionnel est aussi enregistré.
- **Événements Stripe** : point de réception `/api/stripe/connect` (signature vérifiée). Chaque événement est enregistré avec son identifiant : reçu deux fois, il n'est traité qu'une fois. En cas d'erreur, Stripe le renvoie plus tard.
- **Sans les clés Stripe** (`STRIPE_*` dans `.env`), le paiement en ligne est simplement désactivé. En local : clés de test et `stripe listen --forward-connect-to localhost:3000/api/stripe/connect`.

### Codes promo

Packs avec l'option « codes promo » : « Plus → Codes promo » (pourcentage ou montant, dates de validité, nombre d'utilisations). Le champ n'apparaît sur le site que s'il existe un code actif. La réduction s'applique au total, l'acompte est calculé ensuite. Le nombre d'utilisations est respecté même si deux clientes valident en même temps. Un code déjà utilisé est désactivé plutôt que supprimé. Les essais de codes sont limités par adresse IP.

## Messages automatiques (e-mails et SMS)

Envoyés par **Brevo**. Les messages aux clientes partent **au nom de l'établissement** (son nom comme expéditeur, sa couleur, ses coordonnées ; une réponse arrive directement chez lui), dans la langue de la cliente. Ceux destinés aux gérantes partent au nom du SaaS.

| Message                                                                | Destinataire | Quand                                                           |
| ---------------------------------------------------------------------- | ------------ | --------------------------------------------------------------- |
| Confirmation, avec le lien « gérer mon rendez-vous »                   | cliente      | dès la réservation (après paiement de l'acompte s'il y en a un) |
| Rappel par e-mail                                                      | cliente      | 24 h avant (sauf rendez-vous pris moins de 24 h avant)          |
| Rappel par SMS (packs avec SMS)                                        | cliente      | la veille à 18 h, un seul par rendez-vous                       |
| Annulation (avec remboursement éventuel), report, changement d'horaire | cliente      | aussitôt                                                        |
| Paiement arrivé trop tard et remboursé                                 | cliente      | aussitôt                                                        |
| Nouvelle réservation, annulation, report                               | gérante      | aussitôt (réservations en ligne)                                |
| Résumé du lendemain                                                    | gérante      | chaque soir vers 19 h, s'il y a des rendez-vous (désactivable)  |
| Bilan du mois                                                          | gérante      | le 1er vers 8 h (packs qui l'incluent, désactivable)            |
| Avant-dernière et dernière réservation du mois                         | gérante      | pack Basic, à la 4e et à la 5e réservation                      |

- **File d'envoi** : chaque message est enregistré dans la même transaction que l'action qui le déclenche (réservation, annulation…), puis envoyé dans les secondes qui suivent. Son contenu est préparé au moment de l'envoi avec les données à jour : un rappel n'est pas envoyé pour un rendez-vous annulé entre-temps. En cas d'échec, nouvel essai après 2, 8, 18, 32 minutes, puis abandon (5 essais).
- **Jamais en double** : chaque message a une clé unique (ex. un seul rappel SMS par rendez-vous, un seul résumé par jour).
- **SMS** : comptés par établissement et par mois ; au-delà du quota du pack, l'envoi est bloqué (visible sur la fiche du rendez-vous). L'expéditeur est le nom de l'établissement (11 caractères sans accent).
- **Lien « gérer mon rendez-vous »** : calculé à partir de l'identifiant du rendez-vous et de la clé secrète du serveur ; il peut ainsi figurer dans chaque message sans être stocké en clair. Changer `BETTER_AUTH_SECRET` rend les anciens liens inutilisables.
- La gérante voit sur la fiche d'un rendez-vous les messages envoyés à la cliente et leur état.
- Heures et délais : réglages `sms_reminder_time`, `email_reminder_hours_before`, `daily_summary_time`, `monthly_summary_time`, `message_max_attempts`.
- **Sans clé Brevo** en développement, e-mails et SMS s'affichent dans le terminal de `pnpm dev`.
- **Notifications sur le téléphone de la gérante** (Web Push) : chaque alerte à la gérante (réservation en ligne, annulation, report, carte cadeau, demande de données) a une jumelle `push` dans la file, envoyée aux appareils activés depuis la page Notifications de l'espace (`push_subscriptions`). Les clés VAPID sont recalculées à partir de `BETTER_AUTH_SECRET` : rien à configurer (changer ce secret oblige à réactiver les notifications). Sur iPhone, l'espace doit d'abord être ajouté à l'écran d'accueil (iOS 16.4 ou plus).

### Tâche planifiée

Toutes les 5 minutes, `/api/cron/tick` (protégé par `CRON_SECRET`) :

- libère les créneaux retenus pour un paiement qui n'a pas abouti ;
- prépare les rappels et les résumés ;
- envoie les messages en attente ou à réessayer ;
- supprime définitivement les photos remplacées depuis plus de 7 jours.

Chaque étape peut être rejouée sans risque. En local : `pnpm jobs:tick` (le serveur doit tourner).

## Packs et abonnements (Stripe Billing)

Les packs (prix, limites, fonctions) et les réglages commerciaux se modifient dans l'admin : **Admin → Packs** et **Admin → Réglages** (prix HT ou TTC, TVA, engagement, frais de création, délais, heures des messages). Rien n'est écrit dans le code. Une limite vide signifie « illimité », sauf pour les SMS (jamais illimités).

| Situation           | Ce qui se passe                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Basic → pack payant | La gérante choisit son pack (Plus → Abonnement) et paie sur la page sécurisée de Stripe. Le pack s'active dès que Stripe confirme.      |
| Pack supérieur      | Immédiat ; la différence est prélevée au prorata des jours restants.                                                                    |
| Pack inférieur      | À la fin de la période déjà payée. Elle peut revenir sur son choix d'ici là.                                                            |
| Passage au Basic    | À la fin de la période, et au plus tôt à la fin de l'engagement (12 mois, réglable) : les prélèvements continuent jusque-là. Annulable. |
| Prélèvement refusé  | La gérante est prévenue par e-mail et par un bandeau dans son espace ; Stripe réessaie pendant environ 2 semaines.                      |
| Impayé définitif    | Retour automatique au pack Basic ; rien n'est supprimé, elle peut reprendre un pack payant à tout moment.                               |

- **Carte et factures** : bouton « Ma carte et mes factures », qui ouvre le portail Stripe.
- **Prix Stripe** : créés automatiquement (un produit par pack, un prix par tarif). Un nouveau tarif s'applique aux prochaines souscriptions ; les abonnements en cours gardent leur prix.
- **TVA** : taux réglable (20 % par défaut), compris dans le prix si l'affichage est TTC. **À valider avec votre comptable.**
- **Dépassement après un changement de pack** (ex. 3 membres sur un pack qui en permet 1) : rien n'est supprimé, mais aucun ajout n'est possible ; la page Abonnement le signale.
- **Admin → Paiements** : revenu mensuel réel, abonnements, échéances, prélèvements en échec. L'accueil admin signale les impayés et les clients Basic à 5 réservations.
- L'administratrice ne peut pas changer à la main le pack d'un client qui a un abonnement Stripe en cours (pour ne jamais désynchroniser les deux) : elle passe par « Voir comme le client ».
- Événements Stripe des abonnements : point de réception `/api/stripe/billing` (voir `.env.example` pour les événements et les réglages Stripe à faire).

## Site commercial et commandes

**Page d'accueil** (`/fr`), pensée d'abord pour le téléphone :

- l'accroche, avec un visuel de réservation en cours construit en HTML et CSS (net et traduisible) ;
- le comparatif « sans / avec » ;
- les fonctions principales ;
- les packs, lus dans la base, avec un bouton « Commander » ;
- les questions fréquentes, dont celles sur l'argent ;
- le pied de page avec les documents légaux.

Tous les textes sont dans `messages/fr.json` (rubrique `home`). Les chiffres affichés (commission, engagement, frais de création, délai de mise en ligne) viennent des réglages.

**Parcours de commande** :

1. Le professionnel choisit un pack et clique sur « Commander ».
2. Il crée son compte ou se connecte (Google, Apple ou lien par e-mail), puis revient automatiquement sur sa commande.
3. Il remplit un court formulaire : nom, activité, téléphone, site actuel.
4. **Pack payant** : il paie sur la page sécurisée de Stripe ; l'abonnement démarre au paiement. **Basic** : la demande est enregistrée pour validation manuelle.
5. L'administratrice reçoit un e-mail ; la commande apparaît dans **Admin → Commandes** et sur l'accueil admin. Le professionnel reçoit une confirmation, avec le délai de mise en ligne, et suit l'état de sa commande dans son espace.
6. « Créer le site » ouvre le formulaire de nouveau client, pré-rempli : l'abonnement déjà payé y est rattaché.
7. Quand le site est prêt, « Mettre en ligne » termine la commande et envoie au professionnel l'e-mail « votre site est en ligne ».
8. Refus possible avec un motif, envoyé au professionnel. Pour une commande payée, l'abonnement est arrêté ; **le remboursement se fait depuis le tableau de bord Stripe**.

**Documents légaux** : **Admin → Documents légaux**. Chaque enregistrement crée une nouvelle version, et les anciennes sont conservées. Tant qu'un document n'est pas publié, sa page affiche un message d'attente. Textes à faire valider juridiquement.

**Référencement** : titre, description, adresses par langue, `sitemap.xml` et `robots.txt` du site commercial (les espaces privés ne sont pas indexés).

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
3. Commande de construction : `pnpm install --frozen-lockfile && pnpm build`. Démarrage : `pnpm start`. Il applique d'abord tout seul les migrations en attente et les valeurs de départ (`pnpm db:deploy` = `db:migrate` puis `db:seed`, relançables sans risque), puis lance le site : plus rien à taper après un Redeploy. Si une migration échoue, le site ne démarre pas (rien n'est appliqué à moitié) : le message d'erreur est dans les journaux (Logs) de l'application. `pnpm db:roles` ne sert qu'à la première installation, ou si le mot de passe de `APP_DATABASE_URL` change.
4. Pointer `horaneo.com` et `horaneo.fr` vers l'application. `horaneo.fr` redirige automatiquement vers `horaneo.com/fr`.
   **Sous-domaines des clients** (`<client>.horaneo.com`), à faire une seule fois :
   - Cloudflare, zone `horaneo.com` → DNS : enregistrement `A`, nom `*`, même adresse IP que `horaneo.com`, **nuage orange** (Proxied). SSL/TLS en mode **Full** : Cloudflare fournit le certificat de tous les sous-domaines.
   - Coolify → Servers → serveur → Proxy → Dynamic Configurations → fichier `horaneo-clients.yaml` (`service` = nom du service `https-0-<uuid>` lu dans les Container Labels de l'application, suivi de `@docker`) :
     ```yaml
     http:
       routers:
         horaneo-clients:
           rule: 'HostRegexp(`^[a-z0-9-]+\.horaneo\.com$`)'
           entryPoints:
             - https
           service: https-0-<uuid>@docker
           priority: 1
           tls: {}
     ```
     Rien à ajouter ensuite pour chaque nouveau client. Si l'application est supprimée puis recréée dans Coolify, mettre à jour `service`.
5. Se donner le statut d'administratrice depuis le terminal Coolify : `pnpm admin:grant votre@email.fr`.
6. **Tâche planifiée** : dans Coolify, onglet « Scheduled Tasks » de l'application, ajouter une tâche toutes les 5 minutes (`*/5 * * * *`) avec la commande :
   `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/tick`
   (`CRON_SECRET` : `openssl rand -base64 32`, à mettre aussi dans les variables de l'application.)
7. **Brevo** : vérifier le domaine d'envoi (enregistrements DNS SPF et DKIM fournis par Brevo, dans Cloudflare), puis acheter des crédits SMS.
8. **Sauvegardes** (compartiment Cloudflare R2 `horaneo-sauvegardes`, clé R2 « Object Read & Write » limitée à ce compartiment) :
   - **Base de données** : Coolify → Storages S3 → ajouter le compartiment (région `auto`). Puis base PostgreSQL → onglet **Backups** → **+ Add**, fréquence `0 * * * *`, « S3 » coché. Restauration : base PostgreSQL → Configuration → **Import Backup** → « Restore from S3 » (remplace toutes les données).
   - **Logos et photos** (dossier `/app/storage`, volume persistant) : variables `BACKUP_S3_*` de `.env.example` dans l'application, puis Scheduled Task chaque nuit (`17 3 * * *`) avec la commande `pnpm files:backup`. Seuls les fichiers nouveaux ou modifiés partent, dans `fichiers/` ; rien n'est supprimé de la sauvegarde. Restauration : recopier `fichiers/` dans `/app/storage`.
