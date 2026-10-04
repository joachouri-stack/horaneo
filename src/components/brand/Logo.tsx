/**
 * Logo du SaaS : SEUL emplacement à modifier quand les fichiers définitifs
 * seront fournis (remplacer le contenu de ce fichier et de src/app/icon.svg).
 *
 * Version provisoire : « Horaneo » en lettres rondes, dont le premier « o »
 * est une horloge (anneau bleu nuit, arc et aiguilles corail).
 */

type ClockProps = { className?: string; title?: string };

export function ClockMark({ className, title }: ClockProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <circle cx="50" cy="50" r="38" fill="none" stroke="var(--color-navy)" strokeWidth="14" />
      <path d="M50 12 A38 38 0 0 1 88 50" fill="none" stroke="var(--color-coral)" strokeWidth="14" />
      <g stroke="var(--color-coral)" strokeWidth="9" strokeLinecap="round">
        <line x1="50" y1="50" x2="50" y2="31" />
        <line x1="50" y1="50" x2="63" y2="58" />
      </g>
    </svg>
  );
}

type LogoProps = { productName: string; className?: string };

export function Logo({ productName, className }: LogoProps) {
  const [first, ...rest] = productName;
  const restText = rest.join("");
  const clockIndex = restText.toLowerCase().indexOf("o");

  // Si le nom ne contient pas de « o », on affiche simplement le texte.
  if (clockIndex === -1) {
    return <span className={`font-display font-extrabold text-navy ${className ?? ""}`}>{productName}</span>;
  }

  return (
    <span
      className={`inline-flex items-baseline font-display font-extrabold tracking-tight text-navy ${className ?? ""}`}
      aria-label={productName}
      role="img"
    >
      <span aria-hidden="true">{first + restText.slice(0, clockIndex)}</span>
      <ClockMark className="mx-[0.02em] inline-block h-[0.72em] w-[0.72em] self-center translate-y-[0.06em]" />
      <span aria-hidden="true">{restText.slice(clockIndex + 1)}</span>
    </span>
  );
}
