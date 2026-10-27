# Horaneo : règles de design (complément au prompt principal)

## 1. À quoi sert ce fichier

Ce fichier fixe l'apparence d'Horaneo. Il complète le prompt principal et l'emporte sur lui pour tout ce qui touche au visuel.

Référence actuelle (octobre 2026) : la maquette « Réservation / Commerce / Formation » fournie par la direction (trois univers, packs Basic, Pro, Business). Elle remplace l'ancienne maquette corail (`docs/maquette-accueil-horaneo.html`, conservée pour mémoire). Toute amélioration visuelle est proposée avant d'être appliquée.

## 2. L'esprit général

SaaS premium, crédible, professionnel : une plateforme qu'on utilise chaque jour, pas seulement un site. Fin, aéré, sobre. À éviter : boutons massifs, icônes épaisses, badges partout, dégradés vifs, ombres lourdes, cartes chargées, couleurs enfantines, jaune vif.

Promesse : « Votre activité. Un seul outil. Plus de liberté. »

## 3. Les couleurs

| Rôle | Couleur |
|---|---|
| Marque (logo, bouton d'en-tête, bandeau final) | Bleu nuit `#1B2A4A` (logo), avec sa touche corail `#E8503F` réservée au logo |
| Fond | Blanc `#FFFFFF`, sections claires `#F6F8FC` |
| Titres | `#16181D` ; texte courant `#3D4457` ; texte secondaire `#5B6275` |
| Filets et bordures | `#E6E9F0` |
| Réservation (accent) | Indigo maîtrisé `#3A4BB8`, foncé `#2B3990`, pâle `#EEF0FB` |
| Commerce (accent) | Bronze `#946636`, foncé `#74502A`, champagne pâle `#F7F0E5` |
| Formation (accent) | Bleu pétrole `#0E6A73`, foncé `#0A525A`, pâle `#E5F2F2` |
| Pack mis en avant (Pro) | Fond `#121A2C`, champagne `#D9C08E` (dégradé doux vers `#E4CFA2` sur le bouton) |

Règles :

- La marque reste le bleu nuit du logo ; les couleurs des solutions sont des accents (boutons, coches, pictogrammes, mots mis en valeur), posés par `[data-solution]` (`src/app/globals.css`, utilitaires `bg-accent`, `text-accent`, `bg-accent-soft`…).
- Le Pro (« Le plus populaire ») est la seule carte sombre ; le Starter (« Idéal pour démarrer ») porte un filet complet, un léger dégradé et un bouton de l'accent ; le Business (« Le plus complet ») est une carte claire nacrée à filet champagne, bouton champagne sur fond sombre.
- Dégradés : seulement subtils (halo d'accroche, bouton champagne, bandeau final).
- Les sites des clients gardent leurs propres couleurs.

## 4. Les typographies

- **Titres :** Bricolage Grotesque, graisse 600 (jamais 700+), interlettrage -0,025em.
- **Texte :** Outfit 300 à 500.
- **Tailles du site commercial :** 8 tailles seulement, via les classes `text-mk-*` (`src/app/globals.css`) :
  grand titre de l'accueil `text-mk-h1` (36 → 58 px ; sur téléphone, il suit la largeur de l'écran, 24 → 36 px, pour tenir une phrase par ligne), titre de section et de page `text-mk-h2` (30 → 40 px),
  titre de carte `text-mk-card` (20 px), prix des packs `text-mk-price` (40 → 48 px), introduction `text-mk-lead`
  (18 → 19 px), texte courant `text-mk-body` (17 px), texte secondaire `text-mk-small` (15 px), mentions et
  étiquettes `text-mk-note` (14 px). Pas d'autre taille sur ces pages.
- **Logo :** Comfortaa, inchangé.

## 5. Les boutons

- Coins arrondis modérés (0,75rem), hauteur 48px, texte en graisse 500, flèche fine à droite.
- **Principal :** fond de l'accent de la solution (Business : champagne sur fond sombre). Un seul par bloc ; l'action secondaire est un bouton blanc à filet.
- **En-tête :** « Essayer gratuitement », bleu nuit.

## 6. Les cartes

- Fond blanc, filet `#E6E9F0`, coins 1,4rem, ombre légère au survol (soulèvement de 4px).
- Icônes en traits fins (1,6), dans un rond ou un carré pâle de l'accent (`src/components/marketing/line-icons.tsx`).

## 7. Le mouvement

Vivant mais doux (validé en octobre 2026) : l'accroche apparaît en cascade (étiquette avec point lumineux, titre, texte, boutons), la fin du titre porte un dégradé de l'accent qui glisse lentement, des halos flous dérivent derrière l'accroche, les tarifs et le bandeau final. Les blocs apparaissent au défilement en montant légèrement, les cartes une à une. La carte flottante et le téléphone de l'aperçu flottent doucement ; les pictogrammes se soulèvent au survol ; les boutons principaux ont un reflet au survol. Fondu au changement de solution. Tout est coupé si moins de mouvement est demandé, et rien n'est caché sans JavaScript.

Cartes des packs (validé en octobre 2026) : lumière douce qui suit la souris, liseré champagne qui tourne lentement autour du Pro, reflet sur son bouton, pastille glissante du sélecteur Mensuel / Annuel. Prix : partie entière en grand, centimes et devise en petit (Pro en dégradé champagne). Listes limitées à neuf lignes, le reste se déplie.

## 8. La page d'accueil, section par section

1. **En-tête :** logo, Solutions, Tarifs, Fonctionnalités, Ressources, Connexion, bouton « Essayer gratuitement ».
2. **Accroche :** promesse, sous-titre, « Essayer gratuitement » et « Voir la démonstration » (seulement si une adresse de démonstration est réglée dans l'admin ; sinon « Voir les tarifs »). Aucun chiffre de performance inventé.
3. **Choisissez votre solution :** trois cartes (Réservation, Commerce, Formation) ; la solution choisie change l'accent, le titre, les bénéfices, l'aperçu (ordinateur et téléphone dessinés en HTML/CSS) et le bandeau de cinq fonctions. Une solution pas encore ouverte porte « Disponible bientôt » et propose « Être prévenu du lancement », jamais une souscription.
4. **Choisissez votre pack {solution} :** Basic, Pro, Business ; mêmes prix pour toutes les solutions. Chaque carte : pictogramme, nom, phrase, prix (HT), ce que le pack ajoute, « Bientôt inclus » à part, « Non inclus » (3 lignes), bouton, conditions. Offre tablette sur le Business avec les places restantes réelles et ses conditions dépliables.
5. **Fonctionnalités :** sept bénéfices, « Bientôt » quand c'est le cas.
6. **Comparatif :** douze catégories, mêmes données que les cartes et les droits ; sur téléphone, un pack à la fois.
7. **Réassurance :** seulement des engagements vérifiés ; témoignages réels s'il y en a.
8. **Questions, bandeau final, pied de page.**

Les prix, quotas, fonctions, disponibilités et l'offre tablette viennent des réglages (admin), jamais du code.

## 9. Téléphone et accessibilité

- La page est pensée d'abord pour le téléphone : les blocs passent les uns sous les autres, rien ne déborde sur les côtés.
- Zones cliquables d'au moins 44 pixels.
- Contraste suffisant pour tous les textes, y compris sur les fonds colorés.
- De vrais boutons et de vrais liens, utilisables au clavier, avec un contour visible quand ils sont sélectionnés.
- Les images ont un texte de remplacement.

## 10. Les autres écrans

L'écran de commande, l'espace gérante et l'espace admin ne sont pas dessinés. Propose-les dans le même style, puis attends la validation.

- **Écran d'inscription :** boutons "Continuer avec Google", "Continuer avec Apple" et lien par e-mail. C'est là qu'ils se trouvent, pas sur la page d'accueil.
- **Espace gérante et espace admin :** même palette et mêmes boutons, mais en version sobre. Peu de décor, pas d'animation gratuite : ce sont des outils de travail utilisés sur téléphone entre deux rendez-vous.

## 11. Ce qui est encore provisoire

- Les données de la carte de réservation, qui sont des exemples.
- Les promesses de délai : "en quelques jours", "sous 24 heures".
- La mention "sans limite de durée" du pack Basic.
- L'affichage des prix hors taxes ou toutes taxes comprises.

Ces textes doivent être faciles à modifier, et rangés dans les fichiers de traduction.
