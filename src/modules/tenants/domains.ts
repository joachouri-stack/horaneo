import { and, eq } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { tenantDomains } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { assertFeature } from "@/modules/quotas";
import { cleanHost, isValidHostname } from "@/lib/tenancy/hosts";
import { env } from "@/config/env";

/**
 * Domaines propres des clients. Un domaine ajouté est « en attente » jusqu'à ce
 * que son branchement soit vérifié (automatisé avec Cloudflare à l'étape 12).
 */

export async function addCustomDomain(tx: Transaction, tenantId: string, rawHostname: string) {
  await assertFeature(tx, tenantId, "customDomain");
  const hostname = cleanHost(rawHostname.replace(/^https?:\/\//, "").split("/")[0]);
  const main = env().MAIN_DOMAIN;
  if (
    !isValidHostname(hostname) ||
    !hostname.includes(".") ||
    hostname === main ||
    hostname.endsWith(`.${main}`)
  ) {
    throw new AppError("hostname_invalid", "hostname");
  }
  const [taken] = await tx
    .select({ id: tenantDomains.id })
    .from(tenantDomains)
    .where(eq(tenantDomains.hostname, hostname));
  if (taken) throw new AppError("hostname_taken", "hostname");
  const [domain] = await tx
    .insert(tenantDomains)
    .values({ tenantId, hostname, type: "custom", status: "pending", isPrimary: false })
    .returning();
  return domain;
}

async function loadDomain(tx: Transaction, tenantId: string, domainId: string) {
  const [domain] = await tx
    .select()
    .from(tenantDomains)
    .where(and(eq(tenantDomains.id, domainId), eq(tenantDomains.tenantId, tenantId)));
  if (!domain) throw new AppError("not_found");
  return domain;
}

/** Marque un domaine comme branché (manuel en attendant l'automatisation Cloudflare). */
export async function markDomainActive(tx: Transaction, tenantId: string, domainId: string) {
  const domain = await loadDomain(tx, tenantId, domainId);
  await tx
    .update(tenantDomains)
    .set({ status: "active", verifiedAt: new Date() })
    .where(eq(tenantDomains.id, domain.id));
  return domain;
}

/** Choisit l'adresse principale du site ; les autres y redirigent. */
export async function setPrimaryDomain(tx: Transaction, tenantId: string, domainId: string) {
  const domain = await loadDomain(tx, tenantId, domainId);
  if (domain.status !== "active") throw new AppError("domain_not_active", "domain");
  if (domain.type === "custom") await assertFeature(tx, tenantId, "customDomain");
  await tx.update(tenantDomains).set({ isPrimary: false }).where(eq(tenantDomains.tenantId, tenantId));
  await tx.update(tenantDomains).set({ isPrimary: true }).where(eq(tenantDomains.id, domain.id));
  return domain;
}

/** Retire un domaine propre (l'adresse nom.horaneo.com ne se supprime pas). */
export async function removeCustomDomain(tx: Transaction, tenantId: string, domainId: string) {
  const domain = await loadDomain(tx, tenantId, domainId);
  if (domain.type !== "custom") throw new AppError("invalid", "domain");
  await tx.delete(tenantDomains).where(eq(tenantDomains.id, domain.id));
  if (domain.isPrimary) {
    await tx
      .update(tenantDomains)
      .set({ isPrimary: true })
      .where(and(eq(tenantDomains.tenantId, tenantId), eq(tenantDomains.type, "subdomain")));
  }
  return domain;
}
