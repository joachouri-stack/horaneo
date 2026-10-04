import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { withTenant } from "@/db/access";
import { tenants } from "@/db/schema";

/**
 * Charge le tenant d'un site client. Mis en cache pour la durée d'une requête :
 * la mise en page et la page partagent la même lecture.
 */
export const getTenant = cache(async (tenantId: string) => {
  const [tenant] = await withTenant(tenantId, (tx) =>
    tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1),
  );
  return tenant ?? null;
});

export type Tenant = NonNullable<Awaited<ReturnType<typeof getTenant>>>;
