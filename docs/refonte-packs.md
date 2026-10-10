# Refonte des packs : Essentiel, Business, Premium et options à la carte

Octobre 2026. Ce document résume l'audit de l'existant, ce qui a été gardé, modifié ou créé, et ce qui reste à décider.

## 1. Audit de l'existant

| Élément | État avant la refonte |
|---|---|
| Packs | Six packs en base (`plans`) : Basic (gratuit), Essentiel, Sérénité avec réservation ; Express, Vitrine, Signature « site seul ». Prix, limites, fonctions et lignes visibles réglés dans l'admin (`/admin/packs`). |
| Droits | Chaque fonction du site, de l'espace gérante et des messages lit `plans.features` / `plans.limits` du pack du site. |
| Abonnement | Stripe Billing, une ligne par abonnement (le pack). Pack supérieur immédiat au prorata, pack inférieur à l'échéance, fin d'abonnement → Basic. Engagement de `commitment_months`, formule sans engagement avec frais de création. |
| Commande | `/commander` : choix du pack, formule, coordonnées, puis page de paiement Stripe. L'administratrice crée le site et rattache l'abonnement. |
| Site commercial | Cartes de packs avec interrupteur « Avec / Sans réservation » qui retourne les trois cartes ensemble, liste dépliable, tableau `/comparatif`, FAQ de huit questions. |
| Options | Aucune notion d'option : la réservation s'obtenait en changeant de pack. Seuls existaient les packs de SMS (achat unique). |
| Fonctions « Bientôt » | Réglage `features_soon` : une fonction promise mais pas livrée porte l'étiquette « Bientôt ». |

## 2. Conservé

- Moteur d'abonnement Stripe, webhooks, prorata, engagement, impayés, portail.
- Réglages des packs dans l'admin (prix, limites, lignes visibles, fonctions) et `features_soon`.
- Cartes de prix calculées depuis la base (`planCardContent`), tableau comparatif, FAQ en menu déroulant, structure de la page d'accueil, accroche avec téléphone dessiné, étapes, témoignages, bandeau final.
- Les anciens packs restent en base, retirés de la vente : les clients qui y sont abonnés les gardent, rien n'est modifié dans leurs abonnements.

## 3. Modifié

- **Grille** : trois packs vendus, `site-essentiel` (19,90 €, 3 pages), `site-business` (39,90 €, 7 pages, recommandé), `site-premium` (59,90 €, 15 pages). Création offerte, engagement de 12 mois (`commitment_months`). La formule sans engagement n'est plus proposée par défaut (réglage `offer_no_commitment`).
- **Cartes** : chaque carte a son recto et son verso et se retourne seule (`FlipCard`).
- **Stripe** : les options sont des lignes supplémentaires de l'abonnement. La ligne du pack est reconnue par son `plan_id` ; les changements de pack ne touchent qu'elle et le calendrier d'un passage à un pack inférieur garde les options.
- **Droits d'un site** : pack + options actives (`tenantFeatures` / `tenantLimits`, fonctions SQL `app_option_features` / `app_option_limits`).
- **Textes** : accroche, métiers et étapes ouverts à tous les secteurs ; FAQ de dix questions ; conditions commerciales explicites.

## 4. Créé

- Tables `plan_options` (catalogue, tarifs) et `tenant_options` (options d'un site, règles par ligne, écriture réservée au rôle plateforme), colonne `orders.option_codes`.
- Calcul du total (`src/modules/billing/option-total.ts`), le même pour l'accueil, la commande et Stripe.
- Section « Personnalisez votre site selon votre activité » avec calculateur, section « Tableau de bord », section « Conditions ».
- Admin : `/admin/options` (tarifs, proposée, livrée) et options de chaque client sur sa fiche (ajout et retrait sur l'abonnement Stripe).
- Espace gérante : ses options actives sur la page Abonnement.

## 5. Ce qui est réellement disponible

Les fonctions pas encore livrées sont annoncées « Bientôt » (réglage `features_soon`, modifiable dans `/admin/reglages`) :

| Promesse | État |
|---|---|
| Site multi-pages, responsive, galerie, hébergement SSL, nom de domaine, modification des contenus, SEO de base | Disponible |
| Formulaire de contact | Bientôt (déjà annoncé ainsi avant la refonte) |
| Personnalisation graphique avancée, personnalisation premium, présentations avancées | Bientôt |
| Statistiques avancées, SEO avancé | Bientôt |
| Statistiques d'activité | Disponibles, mais calculées sur les rendez-vous : utiles avec l'option Réservation |
| Gestion enrichie (promotions, témoignages), support prioritaire, accompagnement renforcé | Disponible (service) |
| Nombre de pages (3, 7, 15) | Annoncé depuis les réglages du pack ; le site a aujourd'hui un ensemble de pages fixe, la limite n'est pas encore appliquée techniquement |
| Options réservation, paiement en ligne, rappels SMS (100 par mois), cartes cadeaux, fidélité, avis Google | Disponibles |
| Boutique en ligne, devis et factures, fonctionnalités métier | Bientôt (non commandables) |

## 6. À faire avant la mise en vente

1. **Fixer le tarif de chaque option** dans `/admin/options`. Aucun tarif n'a été inventé : tant qu'il est vide, l'option s'affiche « Tarif sur demande », ne compte pas dans le total et ne se commande pas en ligne.
2. Vérifier les limites des nouveaux packs dans `/admin/packs` (membres, photos), reprises des anciens packs équivalents.
3. Relire les textes des conditions et de la FAQ avec les conditions générales de vente (engagement, résiliation, propriété du site, export des données).
4. Ajout ou retrait d'une option par la gérante elle-même : aujourd'hui elle passe par une demande, l'administratrice l'active.
