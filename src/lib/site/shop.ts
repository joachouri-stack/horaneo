import "server-only";
import { z } from "zod";
import { resolveLocale } from "@/i18n/translator";
import { currentSiteTenant } from "@/lib/site/current";
import { getSite } from "@/lib/site/load";
import { AppError } from "@/modules/errors";

const businessIdSchema = z.uuid();

/**
 * Boutique ouverte de cette entreprise sur le site en cours (actions publiques du panier
 * et de la commande) : sinon, introuvable. Le site est recalculé à partir du domaine.
 */
export async function openShop(business: string) {
  const site = await currentSiteTenant();
  const businessId = businessIdSchema.parse(business);
  const data = await getSite(site.tenantId);
  if (!data.shopBusinessIds.includes(businessId)) throw new AppError("not_found");
  return { site, businessId, locale: resolveLocale(data.locale) };
}
