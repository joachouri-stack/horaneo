import { tenantFeatures, tenantLimits } from "@/modules/billing/entitlements";
import { and, eq, gte, lt, lte, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import {
  appointments,
  plans,
  businessSettings,
  tenants,
  type PlanFeatures,
  type PlanLimits,
} from "@/db/schema";
import { addDays, localToUtc, timeToMinutes, utcToLocal } from "@/modules/booking/time";
import { getPlatformSetting } from "@/modules/settings";
import { queueMessage } from "./queue";

/**
 * Messages programmés (rôle plateforme), appelés par la tâche planifiée toutes
 * les 5 minutes. Chaque message porte une clé unique : appeler ces fonctions
 * plusieurs fois n'envoie jamais deux fois le même message.
 */

/** Fenêtre d'envoi des messages du soir et du matin (pas de SMS en pleine nuit si la tâche a pris du retard). */
const WINDOW_MINUTES = 3 * 60;

async function activeTenants(tx: Transaction) {
  const rows = await tx
    .select({
      id: tenants.id,
      timezone: tenants.timezone,
      defaultLocale: tenants.defaultLocale,
      limits: tenantLimits,
      features: tenantFeatures,
    })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.status, "active"));
  return rows.map((row) => ({
    ...row,
    limits: row.limits as PlanLimits,
    features: row.features as PlanFeatures,
  }));
}

/** Entreprises des sites en ligne, avec leurs choix de résumés (un résumé par entreprise). */
async function activeBusinesses(tx: Transaction) {
  const rows = await tx
    .select({
      id: businessSettings.businessId,
      tenantId: tenants.id,
      timezone: tenants.timezone,
      defaultLocale: tenants.defaultLocale,
      features: tenantFeatures,
      dailySummary: businessSettings.dailySummaryEnabled,
      monthlySummary: businessSettings.monthlySummaryEnabled,
    })
    .from(businessSettings)
    .innerJoin(tenants, eq(tenants.id, businessSettings.tenantId))
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.status, "active"));
  return rows.map((row) => ({ ...row, features: row.features as PlanFeatures }));
}

/** L'heure locale de l'établissement est-elle dans la fenêtre qui suit `time` (ex. 18:00) ? */
function inWindow(now: Date, timezone: string, time: string) {
  const local = utcToLocal(now, timezone);
  const minutes = timeToMinutes(local.time) - timeToMinutes(time);
  return { open: minutes >= 0 && minutes < WINDOW_MINUTES, local };
}

/** Rappel par e-mail 24 h avant (réglable), pour les rendez-vous pris plus de 24 h à l'avance. */
export async function queueEmailReminders(tx: Transaction, now: Date) {
  const hours = await getPlatformSetting(tx, "email_reminder_hours_before");
  const horizon = new Date(now.getTime() + hours * 3_600_000);
  // Pas de rappel à moins de 2 h : il arriverait trop tard pour être utile.
  const earliest = new Date(now.getTime() + 2 * 3_600_000);
  const rows = await tx
    .select({ id: appointments.id, tenantId: appointments.tenantId, locale: appointments.locale })
    .from(appointments)
    .innerJoin(tenants, eq(tenants.id, appointments.tenantId))
    .where(
      and(
        eq(tenants.status, "active"),
        eq(appointments.status, "confirmed"),
        gte(appointments.startsAt, earliest),
        lte(appointments.startsAt, horizon),
        // Pris moins de 24 h avant : la confirmation vient d'arriver, pas besoin de rappel.
        lte(appointments.createdAt, sql`${appointments.startsAt} - make_interval(hours => ${hours})`),
      ),
    );
  for (const row of rows) {
    await queueMessage(tx, {
      tenantId: row.tenantId,
      template: "customer.reminder_email",
      appointmentId: row.id,
      locale: row.locale,
    });
  }
  return rows.length;
}

/** Rappel par SMS la veille à 18 h (packs avec SMS), un seul par rendez-vous. */
export async function queueSmsReminders(tx: Transaction, now: Date) {
  const time = await getPlatformSetting(tx, "sms_reminder_time");
  let count = 0;
  for (const tenant of await activeTenants(tx)) {
    const smsLimit = tenant.limits.smsPerMonth;
    if (smsLimit !== null && smsLimit !== undefined && smsLimit <= 0) continue;
    const { open, local } = inWindow(now, tenant.timezone, time);
    if (!open) continue;
    const tomorrow = addDays(local.date, 1);
    const rows = await tx
      .select({ id: appointments.id, locale: appointments.locale })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenant.id),
          eq(appointments.status, "confirmed"),
          gte(appointments.startsAt, localToUtc(tomorrow, "00:00", tenant.timezone)),
          lt(appointments.startsAt, localToUtc(addDays(tomorrow, 1), "00:00", tenant.timezone)),
          // Pris moins de 24 h avant : pas de rappel (décision n° 6), la confirmation vient d'arriver.
          lte(appointments.createdAt, sql`${appointments.startsAt} - interval '24 hours'`),
        ),
      );
    for (const row of rows) {
      await queueMessage(tx, {
        tenantId: tenant.id,
        template: "customer.reminder_sms",
        appointmentId: row.id,
        locale: row.locale,
      });
    }
    count += rows.length;
  }
  return count;
}

/** Résumé du lendemain (chaque soir) et résumé mensuel (le 1er), si la gérante les a gardés. */
export async function queueSummaries(tx: Transaction, now: Date) {
  const dailyTime = await getPlatformSetting(tx, "daily_summary_time");
  const monthlyTime = await getPlatformSetting(tx, "monthly_summary_time");
  let count = 0;
  for (const business of await activeBusinesses(tx)) {
    const daily = inWindow(now, business.timezone, dailyTime);
    if (business.dailySummary && daily.open) {
      const date = addDays(daily.local.date, 1);
      await queueMessage(tx, {
        tenantId: business.tenantId,
        businessId: business.id,
        template: "manager.daily_summary",
        locale: business.defaultLocale,
        data: { date },
        dedupeKey: `manager.daily_summary:${business.id}:${date}`,
      });
      count += 1;
    }
    const monthly = inWindow(now, business.timezone, monthlyTime);
    if (
      business.monthlySummary &&
      business.features.monthlySummary &&
      monthly.open &&
      monthly.local.date.endsWith("-01")
    ) {
      const previous = addDays(monthly.local.date, -1).slice(0, 7);
      await queueMessage(tx, {
        tenantId: business.tenantId,
        businessId: business.id,
        template: "manager.monthly_summary",
        locale: business.defaultLocale,
        data: { period: previous },
        dedupeKey: `manager.monthly_summary:${business.id}:${previous}`,
      });
      count += 1;
    }
  }
  return count;
}

/** Libère les créneaux retenus pendant un paiement qui n'a pas abouti (tous les établissements). */
export async function expireAllHolds(tx: Transaction, now: Date) {
  const rows = await tx
    .update(appointments)
    .set({ status: "expired" })
    .where(and(eq(appointments.status, "pending_payment"), lte(appointments.holdExpiresAt, now)))
    .returning({ id: appointments.id });
  return rows.length;
}
