import { and, eq, lt, notExists } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { appointments, customers, payments, tenantDomains, tenants } from "@/db/schema";
import { getPlatformSetting } from "@/modules/settings";

/**
 * Site de démonstration (choisi dans Admin → Réglages) : les visiteurs du site commercial
 * l'essaient comme un vrai client. Les réservations y sont fictives : pas de paiement en
 * ligne, aucun e-mail ni SMS envoyé, et elles sont effacées au bout d'un jour.
 */

/** Délai avant l'effacement d'une réservation faite sur le site de démonstration. */
export const DEMO_RETENTION_MS = 24 * 60 * 60_000;

export async function demoTenantId(tx: Transaction) {
  return String(await getPlatformSetting(tx, "demo_tenant_id")) || null;
}

export async function isDemoTenant(tx: Transaction, tenantId: string) {
  return (await demoTenantId(tx)) === tenantId;
}

/** Adresse publique du site de démonstration (en ligne seulement), pour le bouton de l'accueil. */
export async function demoSiteHostname(tx: Transaction) {
  const tenantId = await demoTenantId(tx);
  if (!tenantId) return null;
  const [row] = await tx
    .select({ hostname: tenantDomains.hostname })
    .from(tenantDomains)
    .innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
    .where(
      and(
        eq(tenantDomains.tenantId, tenantId),
        eq(tenantDomains.isPrimary, true),
        eq(tenants.status, "active"),
      ),
    );
  return row?.hostname ?? null;
}

/**
 * Efface les réservations en ligne du site de démonstration faites il y a plus d'un jour,
 * puis les clients qui n'ont plus aucun rendez-vous. Rôle plateforme (tâche planifiée).
 */
export async function cleanDemoBookings(tx: Transaction, now = new Date()) {
  const tenantId = await demoTenantId(tx);
  if (!tenantId) return { appointments: 0, customers: 0 };
  const before = new Date(now.getTime() - DEMO_RETENTION_MS);
  const removed = await tx
    .delete(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        eq(appointments.source, "online"),
        lt(appointments.createdAt, before),
        notExists(
          tx.select({ id: payments.id }).from(payments).where(eq(payments.appointmentId, appointments.id)),
        ),
      ),
    )
    .returning({ customerId: appointments.customerId });
  const candidates = [...new Set(removed.map((row) => row.customerId))];
  let customersRemoved = 0;
  for (const customerId of candidates) {
    // Client lié à autre chose (carte cadeau, commande…) : gardé, sans bloquer le nettoyage.
    try {
      await tx.transaction(async (savepoint) => {
        const deleted = await savepoint
          .delete(customers)
          .where(
            and(
              eq(customers.tenantId, tenantId),
              eq(customers.id, customerId),
              notExists(
                savepoint
                  .select({ id: appointments.id })
                  .from(appointments)
                  .where(eq(appointments.customerId, customers.id)),
              ),
            ),
          )
          .returning({ id: customers.id });
        customersRemoved += deleted.length;
      });
    } catch {
      // Laissé tel quel.
    }
  }
  return { appointments: removed.length, customers: customersRemoved };
}
