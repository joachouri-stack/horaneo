/**
 * Logo du SaaS : SEUL emplacement à modifier quand les fichiers définitifs
 * changent. Il affiche le logo officiel, détouré à partir du fichier fourni
 * (public/brand/logo-on-dark.webp : lettres blanches pour les fonds sombres ;
 * logo-on-light.webp : lettres bleu nuit pour les fonds clairs). Les icônes
 * « S » sont dans public/brand/, src/app/icon.png et src/app/apple-icon.png.
 *
 * La taille suit la taille du texte (className « text-… ») : le logo mesure
 * environ 1,3 fois la taille de police, comme l'ancien mot-symbole.
 */

/** Proportions du fichier (largeur / hauteur), pour réserver la place avant le chargement. */
const WIDTH = 1166;
const HEIGHT = 401;

/** light : version claire, pour un fond sombre (en-tête, accroche, pied de page). */
type LogoProps = { productName: string; className?: string; light?: boolean };

export function Logo({ productName, className, light = false }: LogoProps) {
  return (
    <span className={`inline-flex items-center leading-none ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- image détourée du logo officiel, servie telle quelle */}
      <img
        src={light ? "/brand/logo-on-dark.webp" : "/brand/logo-on-light.webp"}
        alt={productName}
        width={WIDTH}
        height={HEIGHT}
        decoding="async"
        className="h-[1.3em] w-auto"
      />
    </span>
  );
}
