import Image from "next/image";

/**
 * Logo du SaaS : SEUL emplacement à modifier quand les fichiers définitifs
 * changent. Il affiche le logo officiel, détouré à partir du fichier fourni
 * (public/brand/logo-on-dark.webp : lettres blanches pour les fonds sombres ;
 * logo-on-light.webp : lettres bleu nuit pour les fonds clairs). Les icônes
 * « S » sont dans public/brand/, src/app/icon.png et src/app/apple-icon.png.
 *
 * La taille suit la taille du texte (className « text-… ») : le logo mesure
 * environ 1,45 fois la taille de police (ligne lumineuse comprise). `sizes` :
 * largeur affichée, pour recevoir un fichier à la bonne taille (pas l'original).
 */

/** Proportions du fichier (largeur / hauteur), pour réserver la place avant le chargement. */
const WIDTH = 1166;
const HEIGHT = 440;

/** light : version claire, pour un fond sombre (en-tête, accroche, pied de page). */
type LogoProps = { productName: string; className?: string; light?: boolean; sizes?: string };

export function Logo({ productName, className, light = false, sizes = "160px" }: LogoProps) {
  return (
    <span className={`inline-flex items-center leading-none ${className ?? ""}`}>
      <Image
        src={light ? "/brand/logo-on-dark.webp" : "/brand/logo-on-light.webp"}
        alt={productName}
        width={WIDTH}
        height={HEIGHT}
        sizes={sizes}
        loading="eager"
        className="h-[1.45em] w-auto"
      />
    </span>
  );
}

/**
 * Empreinte de la marque : le « S » dans son cercle lumineux (fichier officiel détouré).
 * Décorative (ignorée par les lecteurs d'écran). onDark : version pour fond sombre.
 */
export function SirineMark({
  className,
  onDark = false,
  sizes = "64px",
}: {
  className?: string;
  onDark?: boolean;
  /** Largeur affichée (voir Logo). */
  sizes?: string;
}) {
  return (
    <Image
      src={onDark ? "/brand/mark-on-dark.webp" : "/brand/mark-on-light.webp"}
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      sizes={sizes}
      className={className}
    />
  );
}
