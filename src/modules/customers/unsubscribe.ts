import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { authSecret } from "@/config/env";
import type { Transaction } from "@/db/client";
import { customers } from "@/db/schema";

/**
 * Lien « Ne plus recevoir nos offres » des e-mails commerciaux (relance, anniversaire) : il porte
 * l'entreprise, la fiche du client et une signature calculée avec la clé secrète du serveur, sans
 * rien stocker. Le suivre puis confirmer retire son accord pour les offres (e-mail et
 * SMS) ; les messages liés à ses rendez-vous continuent.
 */

const UUID = /^[0-9a-f-]{36}$/i;

type Target = { businessId: string; customerId: string };

function sign({ businessId, customerId }: Target) {
  const key = Buffer.from(hkdfSync("sha256", authSecret(), "marketing-unsubscribe", "v1", 32));
  return createHmac("sha256", key).update(`${businessId}.${customerId}`).digest("base64url").slice(0, 32);
}

export function unsubscribeToken(target: Target) {
  return `${target.businessId}.${target.customerId}.${sign(target)}`;
}

/** Entreprise et fiche du client désignées par le lien, ou null si le lien est faux. */
export function readUnsubscribeToken(token: string): Target | null {
  const [businessId, customerId, signature] = token.split(".");
  if (!businessId || !customerId || !signature || !UUID.test(businessId) || !UUID.test(customerId))
    return null;
  const expected = Buffer.from(sign({ businessId, customerId }));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { businessId, customerId };
}

/** Retire l'accord du client pour recevoir des offres. Faux si la fiche n'existe pas. */
export async function optOutOfMarketing(
  tx: Transaction,
  tenantId: string,
  customerId: string,
  now = new Date(),
) {
  const updated = await tx
    .update(customers)
    .set({ emailConsent: false, smsConsent: false, marketingOptOutAt: now })
    .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)))
    .returning({ id: customers.id });
  return updated.length > 0;
}
