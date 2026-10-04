import Link from "next/link";
import { SITE_PATHS } from "@/modules/site/paths";

/** Bouton « Réserver » aux couleurs du client. */
export function BookButton({
  label,
  serviceId,
  size = "md",
  className = "",
  ariaLabel,
}: {
  label: string;
  serviceId?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  ariaLabel?: string;
}) {
  const href = serviceId ? `${SITE_PATHS.booking}?prestation=${serviceId}` : SITE_PATHS.booking;
  const sizes = { sm: "min-h-10 px-4 text-sm", md: "min-h-12 px-6 text-base", lg: "min-h-14 px-8 text-lg" };
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center rounded-site bg-site-button font-semibold text-site-on-button shadow-sm transition hover:opacity-90 ${sizes[size]} ${className}`}
    >
      {label}
    </Link>
  );
}
