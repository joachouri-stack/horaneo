import { and, eq, sql } from "drizzle-orm";
import { currentBusinessId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { businessSettings } from "@/db/schema";
import type { Locale } from "@/i18n/locales";
import { AppError } from "@/modules/errors";
import { listAgenda } from "./queries";

/**
 * Agenda de l'entreprise sur le téléphone de la gérante : un lien d'abonnement
 * (Google Agenda, Calendrier de l'iPhone…) que le téléphone relit tout seul.
 * Le lien est secret ; « nouveau lien » rend l'ancien inutilisable.
 */

/** Jours passés et à venir publiés dans l'agenda du téléphone. */
export const CALENDAR_FEED_WINDOW = { pastDays: 30, futureDays: 365 } as const;

async function targetBusiness(tx: Transaction) {
  const id = await currentBusinessId(tx);
  if (!id) throw new AppError("not_found");
  return id;
}

/** Version du lien en cours (0 = agenda non partagé). */
export async function calendarFeedState(tx: Transaction, tenantId: string) {
  const businessId = await targetBusiness(tx);
  const [row] = await tx
    .select({ version: businessSettings.calendarFeedVersion })
    .from(businessSettings)
    .where(and(eq(businessSettings.tenantId, tenantId), eq(businessSettings.businessId, businessId)));
  if (!row) throw new AppError("not_found");
  return { businessId, version: row.version };
}

/** Active le lien, ou en crée un nouveau (l'ancien cesse de fonctionner). */
export async function renewCalendarFeed(tx: Transaction, tenantId: string) {
  const businessId = await targetBusiness(tx);
  const [row] = await tx
    .update(businessSettings)
    .set({ calendarFeedVersion: sql`${businessSettings.calendarFeedVersion} + 1` })
    .where(and(eq(businessSettings.tenantId, tenantId), eq(businessSettings.businessId, businessId)))
    .returning({ version: businessSettings.calendarFeedVersion });
  if (!row) throw new AppError("not_found");
  return { businessId, version: row.version };
}

/** Arrête le partage : le lien ne donne plus rien. */
export async function disableCalendarFeed(tx: Transaction, tenantId: string) {
  const businessId = await targetBusiness(tx);
  await tx
    .update(businessSettings)
    .set({ calendarFeedVersion: 0 })
    .where(and(eq(businessSettings.tenantId, tenantId), eq(businessSettings.businessId, businessId)));
}

/** Rendez-vous publiés par le lien, si sa version est toujours la bonne (sinon null). */
export async function calendarFeedAppointments(
  tx: Transaction,
  tenantId: string,
  input: { version: number; locale: Locale; now?: Date },
) {
  const state = await calendarFeedState(tx, tenantId);
  if (state.version === 0 || state.version !== input.version) return null;
  const now = input.now ?? new Date();
  const day = 86_400_000;
  return listAgenda(tx, tenantId, {
    from: new Date(now.getTime() - CALENDAR_FEED_WINDOW.pastDays * day),
    to: new Date(now.getTime() + CALENDAR_FEED_WINDOW.futureDays * day),
    locale: input.locale,
  });
}
