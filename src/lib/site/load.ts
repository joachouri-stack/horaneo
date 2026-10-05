import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { withTenant } from "@/db/access";
import { paymentGateway } from "@/lib/payments/stripe";
import { PREVIEW_HEADER } from "@/lib/tenancy/paths";
import { loadSiteData } from "@/modules/site/data";

/** Données du site d'un client, lues une fois par requête (404 si introuvable). */
export const getSite = cache(async (tenantId: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) notFound();
  const site = await withTenant(tenantId, (tx) => loadSiteData(tx, tenantId));
  if (!site) notFound();
  // Sans paiement en ligne configuré, aucune carte cadeau ne peut être achetée : pas de lien.
  if (!paymentGateway()) return { ...site, giftCardBusinessIds: [] };
  return site;
});

/** Vrai quand l'administratrice regarde un aperçu (jamais indexé). */
export const isPreview = cache(async () => (await headers()).get(PREVIEW_HEADER) === "1");
