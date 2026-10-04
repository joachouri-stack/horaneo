import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getTenantOverview } from "@/modules/tenants/queries";
import { adminQuery } from "./mutation";

/** Fiche d'un client pour l'espace admin (lue une fois par requête). */
export const loadTenantOverview = cache(async (tenantId: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) notFound();
  const overview = await adminQuery((tx) => getTenantOverview(tx, tenantId));
  if (!overview) notFound();
  return overview;
});
