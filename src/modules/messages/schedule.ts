import { tenantFeatures, tenantLimits } from "@/modules/billing/entitlements";
import { and, eq, gte, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { declareBusiness } from "@/db/access";
import type { Transaction } from "@/db/client";
import {
  appointments,
  customers,
  messageLog,
  plans,
  businessSettings,
  tenants,
  type PlanFeatures,
  type PlanLimits,
} from "@/db/schema";
import { getTranslator, resolveLocale } from "@/i18n/translator";
import { addDays, localToUtc, timeToMinutes, utcToLocal } from "@/modules/booking/time";
import { birthdaysCelebratedOn } from "@/modules/customers/birthday";
import { createPersonalPromoCode } from "@/modules/promo/codes";
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

/** Clé unique de l'e-mail d'anniversaire : un seul par cliente et par an. */
export function birthdayDedupeKey(customerId: string, year: string) {
  return `customer.birthday:${customerId}:${year}`;
}

/**
 * Anniversaires du jour (heure réglée dans l'admin, fuseau de chaque site) : pour
 * chaque entreprise qui a activé l'offre, sur un site en ligne dont le pack a les
 * codes promo, chaque cliente née ce jour-là (le 28 février fête aussi les 29 février
 * les années non bissextiles) reçoit un e-mail avec un code personnel. Ni cliente
 * effacée, ni cliente sans e-mail (pas de SMS : aucun SMS du pack n'est utilisé).
 * Le code n'est créé que si le message de l'année n'existe pas encore : rejouer la
 * tâche le même jour ne crée rien.
 */
export async function queueBirthdayOffers(tx: Transaction, now: Date) {
  const time = await getPlatformSetting(tx, "birthday_message_time");
  const rows = await tx
    .select({
      id: businessSettings.businessId,
      tenantId: tenants.id,
      timezone: tenants.timezone,
      defaultLocale: tenants.defaultLocale,
      features: tenantFeatures,
      discountPercent: businessSettings.birthdayDiscountPercent,
      validityDays: businessSettings.birthdayOfferDays,
    })
    .from(businessSettings)
    .innerJoin(tenants, eq(tenants.id, businessSettings.tenantId))
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(and(eq(tenants.status, "active"), eq(businessSettings.birthdayOfferEnabled, true)));
  let count = 0;
  for (const business of rows) {
    if (!(business.features as PlanFeatures).promoCodes) continue;
    const { open, local } = inWindow(now, business.timezone, time);
    if (!open) continue;
    const year = local.date.slice(0, 4);
    // Une entreprise à la fois : ses clientes et ses codes seuls sont visibles.
    await declareBusiness(tx, business.id);
    // Deux tâches simultanées ne créent pas deux codes pour la même cliente.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`birthday:${business.id}`}))`);
    const days = birthdaysCelebratedOn(local.date);
    const celebrated = await tx
      .select({ id: customers.id, locale: customers.locale })
      .from(customers)
      .where(
        and(
          eq(customers.tenantId, business.tenantId),
          eq(customers.businessId, business.id),
          isNull(customers.anonymizedAt),
          isNotNull(customers.email),
          or(...days.map((day) => and(eq(customers.birthMonth, day.month), eq(customers.birthDay, day.day)))),
          sql`not exists (select 1 from ${messageLog} m where m.dedupe_key = 'customer.birthday:' || ${customers.id} || ':' || ${year})`,
        ),
      );
    if (celebrated.length === 0) continue;
    const t = await getTranslator(resolveLocale(business.defaultLocale));
    for (const customer of celebrated) {
      const code = await createPersonalPromoCode(tx, business.tenantId, {
        businessId: business.id,
        customerId: customer.id,
        discountPercent: business.discountPercent,
        validityDays: business.validityDays,
        prefix: t("notifications.customer.birthday.codePrefix"),
        now,
      });
      await queueMessage(tx, {
        tenantId: business.tenantId,
        businessId: business.id,
        template: "customer.birthday",
        locale: customer.locale,
        data: { promoCodeId: code.id },
        dedupeKey: birthdayDedupeKey(customer.id, year),
      });
      count += 1;
    }
  }
  await declareBusiness(tx, null);
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
