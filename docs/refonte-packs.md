# Refonte d'Horaneo : une marque, trois solutions, trois packs

Octobre 2026. Ce document résume ce qui a été gardé, modifié et créé, ce qui est réellement disponible, et ce qui reste à décider.

## 1. Positionnement

« Votre activité. Un seul outil. Plus de liberté. » Horaneo devient le centre de gestion de l'activité du professionnel : site, réservations, clients, paiements, marketing, automatisations.

Une marque, trois solutions qui partagent le même compte, le même tableau de bord, le même abonnement :

| Solution | État |
|---|---|
| Réservation | Ouverte (en production) |
| Commerce | « Disponible bientôt » : présentée, pas de souscription |
| Formation | « Disponible bientôt » : présentée, pas de souscription |

L'état se règle dans `/admin/reglages` (Solutions).

## 2. Packs

| Pack | Prix (HT) | Points clés |
|---|---|---|
| Basic | 0 € | Fiche pro, 10 réservations/mois, 50 contacts, 10 photos, 1 utilisateur, rappels e-mail, domaine connectable |
| Pro | 39,90 €/mois | Site multipage, réservations et contacts illimités, 3 collaborateurs, plannings, Stripe et acomptes, 100 SMS/mois, codes promo, avis Google, statistiques avancées, assistance par ticket |
| Business | 79 €/mois | Configuration accompagnée, collaborateurs illimités, fidélisation, cartes cadeaux, 300 SMS/mois, rapports, nom de domaine offert, assistance prioritaire ; outils IA (quotas réglés, « Bientôt ») |

- Prix, quotas et fonctions : `/admin/packs` (base de données). Rien n'est écrit dans les composants.
- Prix affichés hors taxes (réglage `prices_display`), deux formules : sans engagement ou 12 mois (`commitment_months`, `offer_no_commitment`), sans frais de création.
- Le Basic actuel a été mis à jour (les sites déjà au Basic en profitent) ; les anciens packs restent en base, hors vente, pour leurs abonnés.

## 3. Ce qui est réellement disponible

| Promesse | État |
|---|---|
| Site, réservation, agenda, plannings, fichier clients, rappels e-mail et SMS, Stripe et acomptes, codes promo, avis Google, fidélité, cartes cadeaux, statistiques, résumé mensuel | Disponible |
| Limites Basic (réservations, contacts, photos, utilisateurs) | Vérifiées côté serveur |
| Chatbot IA, assistant WhatsApp, textes et images IA | « Bientôt » ; quotas prêts (compteurs, alerte au seuil, pause à la limite, recharges, remise à zéro mensuelle : `src/modules/billing/usage.ts`) |
| CRM et automatisations avancées, campagnes automatisées, SEO avancé, site en 5 langues | « Bientôt » |
| Modules Commerce et Formation | « Bientôt » (inclus dans Pro et Business à leur lancement) |
| Configuration accompagnée, nom de domaine offert, assistance prioritaire | Services assurés par l'équipe |

« Bientôt » se règle dans `/admin/reglages` (Fonctions annoncées) : décocher une fonction dès qu'elle est livrée.

## 4. Offre tablette

- Réglée dans `/admin/offres` : active ou non, nombre de places (100), réservée à l'engagement, conditions, date de fin.
- Une place est retenue à la commande du Business avec engagement, libérée sans paiement sous 24 h ou si la commande est refusée, confirmée par le premier paiement. L'équipe vérifie l'éligibilité, puis marque l'expédition.
- Les places restantes affichées sont exactes ; l'offre s'arrête d'elle-même une fois complète.

## 5. Source de vérité

`src/modules/billing/grid.ts` décrit chaque ligne (catégorie, fonction ou quota, solution concernée). Les cartes des packs, le comparatif de l'accueil et `/comparatif` en sont tirés, à partir des réglages des packs : les mêmes que ceux qui ouvrent les droits des abonnés (`tenantFeatures` / `tenantLimits`).

## 6. Conservé de l'étape précédente

Options à la carte (`/admin/options`) et leur facturation comme lignes de l'abonnement Stripe : elles ne sont plus présentées sur le site commercial, mais restent disponibles pour l'équipe.

## 7. À décider ou à faire

1. Tarifs des recharges (IA, SMS supplémentaires déjà réglés) et unité de consommation WhatsApp selon le fournisseur.
2. Prix annuels : le sélecteur « Prix annuels » de la maquette n'est pas affiché tant qu'aucun prix annuel n'existe.
3. Garde-fous anti-abus des e-mails du Basic : seuil à définir.
4. Adresse de démonstration (`/admin/reglages`) : le bouton apparaît dès qu'elle est saisie.
5. Anciens abonnés : leurs prix étaient TTC ; l'affichage passe en HT. À vérifier pour leurs factures (leurs prix Stripe ne changent pas).
6. Conditions générales de vente : engagement, offre tablette, quotas, propriété des données.
