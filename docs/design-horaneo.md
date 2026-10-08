# Horaneo : règles de design (complément au prompt principal)

## 1. À quoi sert ce fichier

Ce fichier fixe l'apparence d'Horaneo. Il complète le prompt principal et l'emporte sur lui pour tout ce qui touche au visuel et à la page d'accueil.

Trois fichiers l'accompagnent :

- `docs/maquette-accueil-horaneo.html` : la page d'accueil validée, à ouvrir dans un navigateur.
- Les fichiers du logo, fournis à part.

**Consigne :** reproduis la page d'accueil fidèlement à partir de la maquette. Reprends son code comme base plutôt que de la refaire à l'œil, en le découpant en composants propres. Si tu vois une amélioration, propose-la et attends la validation avant de l'appliquer.

## 2. L'esprit général

Moderne, chaleureux, généreux en espace. Un site qui donne confiance à une gérante d'institut ou à un artisan, sans jargon. Ce qui a été refusé pendant la conception, et qu'il ne faut pas refaire :

- Un rendu fade, plat, sans relief.
- Des boutons noirs.
- Trop de bleu dans les textes.
- Du ton sur ton, par exemple des cartes bleues sur un fond bleu.
- Plusieurs boutons principaux côte à côte.
- Des packs peu mis en valeur.

## 3. Les couleurs

| Rôle | Couleur |
|---|---|
| Fond de page | Ivoire `#FAF7F2` |
| Fond des cartes et sections claires | Blanc `#FFFFFF` |
| Titres | Noir chaud `#16181D` |
| Texte courant | `#3A3833` |
| Texte secondaire | `#6B665E` |
| Accent, numéros, icônes | Corail `#E8503F` |
| Boutons pleins avec texte blanc | Corail foncé `#D4402F` |
| Étiquettes et boutons secondaires | Fond `#FBE3DF`, texte `#9E2B1E` |
| Formes décoratives claires | Rose `#F6C9C1` |
| Bordures | `#ECE6DA` |
| Bleu nuit | `#1B2A4A` |
| Bleu très pâle (packs Basic et Essentiel) | Fond `#E6EAF2`, formes `#C9D2E3` |
| Confirmations | Vert `#2E9E6B` |

Règles d'usage :

- Le bleu nuit sert de surface : logo, pack recommandé, bandeau des étapes. Il n'est jamais la couleur du texte courant ni des titres sur fond clair.
- Exception : sur les packs Basic et Essentiel, le bleu nuit colore les coches, le texte des boutons et les petits liens, sur fond bleu très pâle. Ces cartes s'accordent ainsi au pack recommandé ; le corail n'y apparaît qu'en petites touches.
- Le corail est réservé à l'action et à l'accent. S'il est partout, plus rien ne ressort.
- Sur un fond sombre, les éléments posés dessus sont clairs ou corail, jamais dans la même famille de couleur que le fond.
- Aucun dégradé.
- Les sites des clients gardent leurs propres couleurs. Cette palette ne s'y applique pas.

## 4. Les typographies

- **Titres :** Bricolage Grotesque, graisse 700, interlettrage serré (environ -0,03em), interligne proche de 1.
- **Texte :** Outfit, graisses 400, 500 et 600.
- **Logo uniquement :** Comfortaa 700.

Tailles de référence sur ordinateur : titre principal 3,4rem au maximum (1,85rem sur téléphone), titres de section 2,5 à 3,4rem, texte 1,05rem. Elles se réduisent sur téléphone.

## 5. Les boutons

- Forme de pilule, entièrement arrondie.
- **Principal :** fond corail foncé, texte blanc, avec une flèche à droite. Un seul par section.
- **Secondaire :** fond rose clair `#FBE3DF`, texte `#9E2B1E`. Il devient corail plein avec texte blanc au survol.
- **Sur fond corail :** bouton blanc avec texte `#9E2B1E`.
- **Action de second rang à côté d'un bouton :** simple lien texte, pas un deuxième bouton.
- **Au survol :** le bouton se soulève de 2 pixels avec une ombre, et la flèche avance légèrement.
- Jamais de bouton noir.

## 6. Les cartes

- Coins très arrondis : 1,5 à 2rem.
- Bordure de 2 pixels `#ECE6DA` sur fond blanc.
- **Au survol :** la carte se soulève de 8 à 10 pixels, prend une ombre et un contour corail.
- Les étiquettes sont des pilules, rose clair avec texte `#9E2B1E`.

## 7. Les formes et le mouvement

- Formes décoratives simples : disques pleins et anneaux épais, partiellement hors cadre.
- Le haut de page apparaît en douceur au chargement.
- Les deux cartes posées sur la photo flottent lentement, légèrement inclinées.
- Les animations sont coupées pour les personnes qui ont demandé moins de mouvement dans leur système.
- Le mouvement reste léger : la page doit se charger vite sur téléphone.

## 8. La page d'accueil, section par section

**En-tête**
Logo à gauche. À droite : Comment ça marche, Tarifs, Questions, choix de la langue, Connexion.

**Haut de page**
- Étiquette : "Pour les professionnels sur rendez-vous".
- Titre : "Nous créons votre site." puis, en corail et souligné d'un trait rose épais, "Vos clients réservent."
- Texte : "Un site à votre nom, la réservation en ligne et l'acompte contre les absences. Nous faisons tout, de la création aux mises à jour."
- Un seul bouton : "Je veux mon site". À côté, le lien texte "Voir les tarifs".
- Trois points avec une coche : Sans commission, Votre nom de domaine, Rien à installer.
- À droite, pas de photo : un téléphone droit, dessiné en HTML et CSS, qui affiche le site d'un client à l'étape du créneau (prestation, durée, prix, jour, heure, acompte, bouton "Payer l'acompte"). Derrière lui, un simple disque rose clair. Deux petites cartes droites, non inclinées : "Nouvelle réservation" en haut à droite, "Acompte reçu" en bas à gauche. Aucune ne doit cacher le contenu du téléphone.
- Sur ordinateur, tout le haut de page tient dans un écran de 1366 x 768. Sur téléphone, les liens du menu sont masqués et le haut du téléphone dessiné est visible dès le premier écran.

**Bande des métiers**
"Pensé pour" suivi de pilules : Instituts de beauté, Salons de coiffure, Barbiers, Bien-être, Tatoueurs, Coachs, Garages, Artisans.

**Les trois étapes**
Grand bandeau bleu nuit aux coins très arrondis. Titre "Vous n'avez rien à faire.", avec "rien à faire" en corail. Trois cartes : blanche, corail, blanche. Chacune a une icône, un grand numéro plein, un titre, un texte et une étiquette.

1. "Nous créons votre site" : étiquette "C'est nous qui le faisons".
2. "Vos clientes réservent" : étiquette "Sans rien installer".
3. "Vous encaissez" : acompte, paiement complet ou règlement sur place, au choix. Étiquette "Sans commission".

**Les packs**
Titre centré "Un prix clair, sans commission." Trois cartes, chacune avec une icône, un nom, une phrase qui dit à qui elle s'adresse, un prix en très gros, trois tuiles de chiffres clés (réservations, membres, SMS), un bouton, puis la liste des fonctions. Les fonctions non incluses apparaissent en gris avec un tiret.

- Basic : "Commencer gratuitement".
- Essentiel : "Choisir Essentiel".
- Basic et Essentiel : cartes blanches, accents bleus (coches bleu nuit sur bleu très pâle, bouton bleu très pâle qui passe bleu nuit au survol, contour bleu nuit au survol), avec trois petites touches de corail : le pictogramme du pack (sur bleu très pâle), le point du décor et la flèche du bouton. Fonds, contour et bouton plein en corail restent réservés au pack recommandé.
- Sérénité : carte plus haute, fond bleu nuit, contour corail, étiquette "Recommandé", bouton corail "Choisir Sérénité".

Sous les cartes : Aucune commission, Paiements sécurisés, Vos données vous appartiennent.

Les prix, quotas et fonctions affichés viennent des réglages des packs, jamais de texte écrit dans la page.

**Questions fréquentes**
À gauche, le titre "Les questions qu'on nous pose" et le lien "Nous écrire". À droite, six questions en menu déroulant, la première ouverte. À l'ouverture, le contour passe en corail et le "+" tourne.

**Bandeau final**
Fond corail foncé, coins très arrondis, formes décoratives. Titre "Votre site en ligne en quelques jours." et bouton blanc "Je veux mon site".

**Pied de page**
Logo à gauche et liens légaux à droite. En dessous, séparés par un trait fin : "© 2026 HORANEO · Tous droits réservés" à gauche, "Design by Johane A." à droite.

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
