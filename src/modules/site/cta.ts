import type { SiteData } from "./data";
import { SITE_PATHS } from "./paths";

type Site = NonNullable<SiteData>;

/**
 * Bouton principal d'une page du site : « Réserver » si l'entreprise prend
 * des rendez-vous en ligne, sinon « Appeler » (ou « Écrire » sans téléphone).
 * null : aucun moyen de contact à proposer.
 */
export type SiteCta =
  { kind: "book"; href: string } | { kind: "call"; href: string } | { kind: "write"; href: string } | null;

export function siteCta(
  site: Site,
  options: { businessId?: string | null; serviceId?: string } = {},
): SiteCta {
  const businessId =
    options.businessId ??
    (options.serviceId
      ? site.services.find((service) => service.id === options.serviceId)?.businessId
      : null);
  const business = businessId ? site.businesses.find((item) => item.id === businessId) : null;
  const open = business ? business.bookingEnabled : site.bookingEnabled;
  if (open) {
    const query = options.serviceId
      ? `?prestation=${options.serviceId}`
      : options.businessId
        ? `?avec=${options.businessId}`
        : "";
    return { kind: "book", href: `${SITE_PATHS.booking}${query}` };
  }
  const phone = business?.phone ?? site.tenant.phone;
  if (phone) return { kind: "call", href: `tel:${phone}` };
  const email = business?.email ?? site.tenant.email;
  if (email) return { kind: "write", href: `mailto:${email}` };
  return null;
}

/** Clé de traduction (espace « site ») du libellé du bouton. */
export const ctaLabelKey = (cta: NonNullable<SiteCta>) =>
  cta.kind === "book" ? "book" : cta.kind === "call" ? "call" : "write";
