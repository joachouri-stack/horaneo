"use server";

import { redirect } from "next/navigation";
import { withTenant } from "@/db/access";
import { currentSiteTenant, publicLimits } from "@/lib/site/current";
import { optOutOfMarketing, readUnsubscribeToken } from "@/modules/customers/unsubscribe";
import { SITE_PATHS } from "@/modules/site/paths";

/** Confirmation du lien « Ne plus recevoir nos offres » : l'accord du client est retiré. */
export async function unsubscribeAction(data: FormData) {
  const site = await currentSiteTenant();
  const token = String(data.get("t") ?? "");
  const target = readUnsubscribeToken(token);
  if (!target || !publicLimits.customerLogin.attempt(`unsubscribe:${site.ip}`)) {
    redirect(`${SITE_PATHS.unsubscribe}?erreur=1`);
  }
  const done = await withTenant(
    site.tenantId,
    (tx) => optOutOfMarketing(tx, site.tenantId, target.customerId),
    undefined,
    target.businessId,
  );
  redirect(`${SITE_PATHS.unsubscribe}?${done ? "fait=1" : "erreur=1"}`);
}
