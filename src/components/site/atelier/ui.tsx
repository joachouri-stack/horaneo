import Link from "next/link";
import { ArrowIcon } from "./icons";

/**
 * Éléments communs du modèle Atelier : boutons « pilule » avec flèche ronde,
 * étiquettes, titres à fin italique.
 */

const PILL = {
  primary: "bg-site-button text-site-on-button",
  outline: "border border-site-text text-site-text bg-transparent",
  light: "bg-site-card text-site-accent",
} as const;

const DOT = {
  primary: "bg-site-on-button text-site-button",
  outline: "bg-site-text text-site-bg",
  light: "bg-site-button text-site-on-button",
} as const;

export function PillLink({
  href,
  children,
  variant = "primary",
  size = "md",
  className = "",
  ariaLabel,
  prefetch,
}: {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof PILL;
  size?: "sm" | "md" | "lg";
  className?: string;
  ariaLabel?: string;
  prefetch?: boolean;
}) {
  const sizes = {
    sm: "min-h-10 gap-3 pl-4 pr-1 text-sm",
    md: "min-h-12 gap-4 pl-5 pr-1.5 text-[0.95rem]",
    lg: "min-h-14 gap-4 pl-6 pr-1.5 text-base",
  };
  const dots = { sm: "h-8 w-8", md: "h-9 w-9", lg: "h-11 w-11" };
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      prefetch={prefetch}
      className={`inline-flex items-center justify-between rounded-full font-semibold transition hover:opacity-90 ${PILL[variant]} ${sizes[size]} ${className}`}
    >
      <span>{children}</span>
      <span
        className={`flex shrink-0 items-center justify-center rounded-full ${DOT[variant]} ${dots[size]}`}
      >
        <ArrowIcon />
      </span>
    </Link>
  );
}

export function Tag({
  children,
  tone = "soft",
}: {
  children: React.ReactNode;
  /** « card » : sur un fond déjà rosé. */
  tone?: "soft" | "light" | "card";
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${tone === "soft" ? "bg-site-surface text-site-accent" : tone === "card" ? "bg-site-card text-site-accent" : "bg-white/15 text-current"}`}
    >
      {children}
    </span>
  );
}

/** Titre de section : début droit, fin en italique couleur d'accent. */
export function SectionTitle({
  start,
  accent,
  id,
  as: Heading = "h2",
  className = "",
  breakLine = false,
}: {
  start: string;
  accent?: string;
  id?: string;
  as?: "h1" | "h2";
  className?: string;
  breakLine?: boolean;
}) {
  return (
    <Heading
      id={id}
      className={`font-site-display text-4xl leading-[1.05] font-medium text-site-text sm:text-5xl ${className}`}
    >
      {start}
      {accent && (
        <>
          {breakLine ? <br /> : " "}
          <em className="font-medium text-site-accent">{accent}</em>
        </>
      )}
    </Heading>
  );
}
