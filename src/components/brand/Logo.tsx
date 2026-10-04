/**
 * Logo du SaaS : SEUL emplacement à modifier quand les fichiers définitifs
 * seront fournis (remplacer le contenu de ce fichier et de src/app/icon.svg).
 *
 * « Horaneo » en lettres rondes (Comfortaa), dont le premier « o » est une
 * horloge : anneau bleu nuit ouvert, arc et aiguilles corail.
 */

type ClockProps = { className?: string; title?: string };

export function ClockMark({ className, title }: ClockProps) {
  return (
    <svg
      viewBox="0 0 54 54"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path
        d="M40.18 42.70 A20.5 20.5 0 1 1 22.39 7.02"
        fill="none"
        stroke="var(--color-navy)"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M39.62 10.85 A20.5 20.5 0 0 1 47.49 27.72"
        fill="none"
        stroke="var(--color-coral)"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M27 27 L27 18.5 M27 27 L33.5 30.5"
        fill="none"
        stroke="var(--color-coral)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type LogoProps = { productName: string; className?: string };

/** Lettres rondes, légèrement épaissies d'un contour de la même couleur. */
const LETTERS =
  "font-logo font-bold tracking-[0.03em] text-navy [-webkit-text-stroke:0.05em_currentColor] [paint-order:stroke_fill]";

export function Logo({ productName, className }: LogoProps) {
  const [first, ...rest] = productName;
  const restText = rest.join("");
  const clockIndex = restText.toLowerCase().indexOf("o");

  // Si le nom ne contient pas de « o », on affiche simplement le texte.
  if (clockIndex === -1) {
    return <span className={`${LETTERS} ${className ?? ""}`}>{productName}</span>;
  }

  return (
    <span
      className={`inline-flex items-baseline leading-none ${LETTERS} ${className ?? ""}`}
      aria-label={productName}
      role="img"
    >
      <span aria-hidden="true">{first + restText.slice(0, clockIndex)}</span>
      <ClockMark className="mx-[0.04em] inline-block h-[0.7em] w-[0.7em] translate-y-[0.04em]" />
      <span aria-hidden="true">{restText.slice(clockIndex + 1)}</span>
    </span>
  );
}
