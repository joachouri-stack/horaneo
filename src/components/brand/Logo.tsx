/**
 * Logo du SaaS : SEUL emplacement à modifier quand les fichiers définitifs
 * seront fournis (remplacer le contenu de ce fichier et de src/app/icon.svg).
 *
 * Mot-symbole « Sirine » : première lettre en dégradé violet → bleu, un arc
 * dégradé au-dessus du reste du nom, et le pictogramme de quatre carrés arrondis.
 * Le nom vient de la configuration (PRODUCT_NAME), jamais écrit en dur.
 */

/** Dégradé du logo (violet → bleu), repris par les pictogrammes. */
const GRADIENT = "bg-[linear-gradient(135deg,var(--color-violet)_10%,var(--color-azure)_90%)]";

type MarkProps = { className?: string; title?: string };

/** Pictogramme seul : quatre carrés arrondis, trois bleus et un violet. */
export function LogoMark({ className, title }: MarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect x="2" y="2" width="9" height="9" rx="2.4" fill="var(--color-azure)" />
      <rect x="13" y="2" width="9" height="9" rx="2.4" fill="var(--color-azure)" />
      <rect x="2" y="13" width="9" height="9" rx="2.4" fill="var(--color-azure-dark)" />
      <rect x="13" y="13" width="9" height="9" rx="2.4" fill="var(--color-violet)" />
    </svg>
  );
}

/** light : version claire, pour un fond sombre (accroche, pied de page). */
type LogoProps = { productName: string; className?: string; light?: boolean };

export function Logo({ productName, className, light = false }: LogoProps) {
  const [first, ...rest] = productName;
  return (
    <span
      role="img"
      aria-label={productName}
      className={`relative inline-flex items-start font-sans font-semibold leading-none tracking-[-0.03em] ${light ? "text-white" : "text-navy"} ${className ?? ""}`}
    >
      <span aria-hidden="true" className="relative">
        <span className={`${GRADIENT} bg-clip-text pr-[0.01em] text-transparent`}>{first}</span>
        {rest.join("")}
        {/* Arc dégradé au-dessus du nom, comme sur le logo. */}
        <svg
          viewBox="0 0 100 24"
          preserveAspectRatio="none"
          className="pointer-events-none absolute -top-[0.2em] left-[0.62em] h-[0.3em] w-[calc(100%-0.62em)]"
        >
          <defs>
            <linearGradient id="logo-arc" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="var(--color-violet)" />
              <stop offset="1" stopColor="var(--color-azure)" />
            </linearGradient>
          </defs>
          <path
            d="M2 22 C 30 -4, 70 -4, 98 18"
            fill="none"
            stroke="url(#logo-arc)"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <LogoMark className="ml-[0.08em] mt-[0.05em] h-[0.42em] w-[0.42em] flex-none" />
    </span>
  );
}
