import "server-only";
import { redirect } from "next/navigation";
import type { SiteData } from "@/modules/site/data";
import { visibleSections } from "@/modules/site/data";
import { SITE_PATHS } from "@/modules/site/paths";

/**
 * Les pages intérieures n'existent que sur un site complet, et seulement si
 * elles ont du contenu ; sinon retour à l'accueil (la fiche Basic tient en une page).
 */
export function requireSection(
  site: NonNullable<SiteData>,
  section: keyof ReturnType<typeof visibleSections>,
) {
  if (!visibleSections(site)[section]) redirect(SITE_PATHS.home);
}
