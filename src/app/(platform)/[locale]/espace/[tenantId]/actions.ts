"use server";

import { categoryFields } from "@/modules/catalog/icons";
import { redeemOnSite, updateGiftCardSettings } from "@/modules/giftcards/giftcards";
import { deletePromotion, savePromotion } from "@/modules/promotions/promotions";
import { headers } from "next/headers";
import { redirect as redirectTo } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { publicAppUrl } from "@/config/env";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import type { ActionResult } from "@/lib/actions/result";
import { form } from "@/lib/admin/mutation";
import {
  managerMutation,
  managerPersonalAction,
  managerPlatformAction,
  managerQuery,
} from "@/lib/manager/access";
import { removeDevice, saveDevice, queuePushTest, type DeviceInput } from "@/modules/notifications/devices";
import { paymentGateway } from "@/lib/payments/stripe";
import { billingGateway } from "@/lib/payments/stripe-billing";
import { startSmsPackPurchase } from "@/modules/billing/sms-packs";
import { openBillingPortal, requestPlanChange } from "@/modules/billing/subscriptions";
import { assertPrimaryBusiness } from "@/modules/businesses/businesses";
import { storage } from "@/lib/storage";
import {
  cancelByManager,
  createManualAppointment,
  moveAppointment,
  setAttendance,
  updateInternalNote,
} from "@/modules/agenda/actions";
import { getSlotsForRange, loadBookingContext } from "@/modules/booking/availability";
import { setOnlineBooking, updateBookingSettings } from "@/modules/booking/settings";
import { disableCalendarFeed, renewCalendarFeed } from "@/modules/agenda/calendar-feed";
import { DATE_PATTERN, localToUtc } from "@/modules/booking/time";
import { deleteCategory, deleteService, saveCategory, saveService } from "@/modules/catalog/services";
import { deleteTestimonial, saveTestimonial } from "@/modules/content/testimonials";
import { saveCustomer, searchCustomers } from "@/modules/customers/customers";
import { assertSitePhoto, restoreAsset, retireAsset, uploadAsset } from "@/modules/media/assets";
import { parseInterval } from "@/modules/billing/yearly";
import { AppError } from "@/modules/errors";
import { refreshAccount, startOnboarding } from "@/modules/payments/connect";
import { setBirthdayOffer } from "@/modules/promo/birthday";
import { deletePromoCode, savePromoCode } from "@/modules/promo/codes";
import { createUpdateRequest } from "@/modules/requests/update-requests";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { createTimeOff, deleteTimeOff } from "@/modules/schedule/time-off";
import { updateStatsGoals } from "@/modules/stats/goals";
import { replaceStaffSchedules } from "@/modules/team/schedules";
import { deleteStaff, saveStaff, setStaffPhoto } from "@/modules/team/staff";
import type { Transaction } from "@/db/client";
import { tenants } from "@/db/schema";
import { resolveDataRequest } from "@/modules/customer-space/space";
import { adjustLoyalty, setLoyaltySettings, redeemReward } from "@/modules/loyalty/loyalty";
import { parseMoney } from "@/modules/money";
import { eq } from "drizzle-orm";

/**
 * Actions de l'espace gérante. Chacune revérifie que la personne connectée gère
 * bien cet établissement (ou est l'administratrice, et alors c'est journalisé),
 * puis agit avec le rôle du tenant.
 */

type Previous = ActionResult<unknown> | null;

const uuid = z.uuid();
const tenantIdOf = (data: FormData) => uuid.parse(form.text(data, "tenantId"));
const idOf = (data: FormData, key = "id") => {
  const value = form.optional(data, key);
  return value ? uuid.parse(value) : undefined;
};
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Début saisi (date + heure locales de l'établissement), lu dans la transaction de
 * l'action : une saisie invalide devient un message sur le champ, pas une page d'erreur.
 */
async function localStart(tx: Transaction, tenantId: string, data: FormData) {
  const date = z.string().regex(DATE_PATTERN).parse(form.text(data, "date"));
  const time = z.string().regex(TIME).parse(form.text(data, "time"));
  const [{ timezone }] = await tx
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return localToUtc(date, time, timezone);
}

// ─── Rendez-vous ──────────────────────────────────────────────────────────────

export async function setAttendanceAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const status = z.enum(["attended", "no_show", "confirmed"]).parse(form.text(data, "status"));
  return managerMutation(tenantId, `appointment.${status}`, (tx) =>
    setAttendance(tx, tenantId, idOf(data)!, status),
  );
}

export async function cancelAppointmentAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const refund = form.bool(data, "refund");
  return managerMutation(
    tenantId,
    refund ? "appointment.cancelled_refunded" : "appointment.cancelled",
    (tx) =>
      cancelByManager(tx, tenantId, idOf(data)!, form.optional(data, "reason"), {
        refund,
        gateway: paymentGateway(),
      }),
  );
}

export async function moveAppointmentAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "appointment.moved", async (tx) =>
    moveAppointment(tx, tenantId, idOf(data)!, {
      start: await localStart(tx, tenantId, data),
      staffId: idOf(data, "staffId")!,
    }),
  );
}

export async function updateNoteAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "appointment.note", (tx) =>
    updateInternalNote(tx, tenantId, idOf(data)!, form.text(data, "internalNote")),
  );
}

export async function createManualAction(
  _previous: Previous,
  data: FormData,
): Promise<ActionResult<unknown>> {
  const tenantId = tenantIdOf(data);
  const customerId = idOf(data, "customerId");
  const result = await managerMutation(tenantId, "appointment.created", async (tx) =>
    createManualAppointment(tx, tenantId, {
      serviceIds: form.all(data, "serviceIds"),
      staffId: form.text(data, "staffId"),
      start: await localStart(tx, tenantId, data),
      customerId,
      newCustomer: customerId
        ? undefined
        : {
            firstName: form.text(data, "firstName"),
            lastName: form.optional(data, "lastName"),
            phone: form.optional(data, "phone"),
            email: form.optional(data, "email"),
          },
      internalNote: form.optional(data, "internalNote"),
    }),
  );
  if (!result.ok) return result;
  redirect({
    href: `/espace/${tenantId}/rendez-vous/${result.data!.appointmentId}`,
    locale: resolveLocale(await getLocale()),
  });
  return result;
}

/** Créneaux libres d'un jour (aide à la saisie d'un rendez-vous manuel). */
export async function freeSlotsAction(tenantId: string, serviceIds: string[], staffId: string, date: string) {
  const ids = z.array(uuid).min(1).max(10).parse(serviceIds);
  const member = uuid.parse(staffId);
  const day = z.string().regex(DATE_PATTERN).parse(date);
  return managerQuery(uuid.parse(tenantId), async (tx) => {
    const context = await loadBookingContext(tx, tenantId);
    const slots =
      (
        await getSlotsForRange(
          tx,
          { ...context, settings: { ...context.settings, minNoticeMinutes: 0 } },
          { serviceIds: ids, staffId: member, fromDate: day, days: 1, now: new Date(), onlineOnly: false },
        )
      ).get(day) ?? [];
    return slots.map((slot) => slot.time);
  }).catch(() => [] as string[]);
}

export async function searchCustomersAction(tenantId: string, query: string) {
  return managerQuery(uuid.parse(tenantId), (tx) =>
    searchCustomers(tx, tenantId, z.string().max(80).parse(query), 8),
  );
}

// ─── Indisponibilités ─────────────────────────────────────────────────────────

export type TimeOffResult = ActionResult<{ conflicts: { id: string; startsAt: Date }[] }>;

export async function createTimeOffAction(
  _previous: Previous,
  data: FormData,
): Promise<ActionResult<unknown>> {
  const tenantId = tenantIdOf(data);
  const kind = form.text(data, "kind");
  const reason = form.optional(data, "reason");
  const input =
    kind === "block"
      ? {
          kind: "block" as const,
          staffId: form.text(data, "staffId"),
          date: form.text(data, "date"),
          from: form.text(data, "from"),
          to: form.text(data, "to"),
          reason,
        }
      : kind === "leave"
        ? {
            kind: "leave" as const,
            staffId: form.text(data, "staffId"),
            startDate: form.text(data, "startDate"),
            endDate: form.text(data, "endDate"),
            reason,
          }
        : {
            kind: "closure" as const,
            startDate: form.text(data, "startDate"),
            endDate: form.text(data, "endDate"),
            reason,
          };
  return managerMutation(tenantId, `time_off.${kind}`, async (tx) => {
    const result = await createTimeOff(tx, tenantId, input);
    return { conflicts: result.conflicts };
  });
}

export async function deleteTimeOffAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "time_off.deleted", (tx) => deleteTimeOff(tx, tenantId, idOf(data)!));
}

// ─── Clientes ─────────────────────────────────────────────────────────────────

export async function saveCustomerAction(
  _previous: Previous,
  data: FormData,
): Promise<ActionResult<unknown>> {
  const tenantId = tenantIdOf(data);
  const id = idOf(data);
  const result = await managerMutation(tenantId, id ? "customer.updated" : "customer.created", (tx) =>
    saveCustomer(
      tx,
      tenantId,
      {
        firstName: form.text(data, "firstName"),
        lastName: form.optional(data, "lastName"),
        phone: form.optional(data, "phone"),
        email: form.optional(data, "email"),
        notes: form.optional(data, "notes"),
        // Jour et mois : vides tous les deux pour effacer l'anniversaire.
        birthMonth: form.text(data, "birthMonth"),
        birthDay: form.text(data, "birthDay"),
      },
      id,
    ),
  );
  if (result.ok && !id)
    redirect({
      href: `/espace/${tenantId}/clientes/${(result.data as { id: string }).id}`,
      locale: resolveLocale(await getLocale()),
    });
  return result;
}

// ─── Mon site ─────────────────────────────────────────────────────────────────

export async function saveCategoryAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "category.saved", (tx) =>
    saveCategory(tx, tenantId, categoryFields(data), idOf(data)),
  );
}

export async function deleteCategoryAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "category.deleted", (tx) => deleteCategory(tx, tenantId, idOf(data)!));
}

export async function saveServiceAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "service.saved", (tx) =>
    saveService(
      tx,
      tenantId,
      {
        name: form.text(data, "name"),
        description: form.optional(data, "description"),
        categoryId: form.optional(data, "categoryId") ?? null,
        durationMinutes: form.text(data, "durationMinutes") as unknown as number,
        bufferMinutes: (form.optional(data, "bufferMinutes") ?? "0") as unknown as number,
        price: form.text(data, "price"),
        priceFrom: form.bool(data, "priceFrom"),
        isOnlineBookable: form.bool(data, "isOnlineBookable"),
        isActive: form.bool(data, "isActive"),
      },
      idOf(data),
    ),
  );
}

export async function deleteServiceAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "service.deleted", (tx) => deleteService(tx, tenantId, idOf(data)!));
}

export async function saveHoursAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "hours.updated", (tx) =>
    replaceOpeningHours(tx, tenantId, parseRanges(data)),
  );
}

function parseRanges(data: FormData) {
  return form
    .all(data, "range")
    .map((value) => {
      const [weekday, opensAt, closesAt] = value.split("|");
      return { weekday: Number(weekday), opensAt, closesAt };
    })
    .filter((range) => range.opensAt && range.closesAt);
}

export async function uploadPhotoAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const kind = z.enum(["gallery", "cover", "staff", "service", "other"]).parse(form.text(data, "kind"));
  const bytes = (await form.file(data, "file")) ?? new Uint8Array();
  return managerMutation(tenantId, "asset.uploaded", async (tx, context) => {
    await assertPrimaryBusiness(tx, tenantId, context.businessId, "site_content_primary_only");
    return uploadAsset(tx, storage(), tenantId, {
      bytes,
      kind,
      uploadedByUserId: context.userId,
      alt: form.optional(data, "alt"),
    });
  });
}

export async function photoAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const id = idOf(data)!;
  const operation = z.enum(["retire", "restore"]).parse(form.text(data, "operation"));
  return managerMutation(tenantId, `asset.${operation}`, async (tx, context) => {
    await assertPrimaryBusiness(tx, tenantId, context.businessId, "site_content_primary_only");
    await assertSitePhoto(tx, tenantId, id);
    return operation === "retire" ? retireAsset(tx, tenantId, id) : restoreAsset(tx, tenantId, id);
  });
}

export async function saveTestimonialAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "testimonial.saved", async (tx, context) => {
    await assertPrimaryBusiness(tx, tenantId, context.businessId, "site_content_primary_only");
    return saveTestimonial(
      tx,
      tenantId,
      {
        authorName: form.text(data, "authorName"),
        text: form.text(data, "text"),
        rating: form.optional(data, "rating") ? Number(form.text(data, "rating")) : null,
        isPublished: form.bool(data, "isPublished"),
      },
      idOf(data),
    );
  });
}

export async function deleteTestimonialAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "testimonial.deleted", async (tx, context) => {
    await assertPrimaryBusiness(tx, tenantId, context.businessId, "site_content_primary_only");
    return deleteTestimonial(tx, tenantId, idOf(data)!);
  });
}

// ─── Plus : équipe, réglages, demandes ───────────────────────────────────────

export async function saveStaffAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "staff.saved", (tx) =>
    saveStaff(
      tx,
      tenantId,
      {
        name: form.text(data, "name"),
        bio: form.optional(data, "bio"),
        color: form.optional(data, "color"),
        isActive: form.bool(data, "isActive"),
        serviceIds: form.all(data, "serviceIds"),
      },
      idOf(data),
    ),
  );
}

/** Photo d'un membre de l'équipe : envoi (recadrée et compressée par le serveur) ou retrait. */
export async function staffPhotoAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const staffId = idOf(data)!;
  const remove = form.text(data, "operation") === "remove";
  const bytes = remove ? null : ((await form.file(data, "file")) ?? new Uint8Array());
  return managerMutation(tenantId, remove ? "staff.photo_removed" : "staff.photo", async (tx, context) => {
    if (!bytes) return setStaffPhoto(tx, tenantId, staffId, null);
    const asset = await uploadAsset(tx, storage(), tenantId, {
      bytes,
      kind: "staff",
      uploadedByUserId: context.userId,
    });
    return setStaffPhoto(tx, tenantId, staffId, asset.id);
  });
}

export async function deleteStaffAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const result = await managerMutation(tenantId, "staff.deleted", (tx) =>
    deleteStaff(tx, tenantId, idOf(data)!),
  );
  if (result.ok && result.data?.deleted === false) {
    const t = await getTranslations("manager.team");
    return { ...result, message: t("deactivatedInstead", { upcoming: result.data.upcoming }) };
  }
  return result;
}

export async function saveStaffScheduleAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "staff.schedule", (tx) =>
    replaceStaffSchedules(tx, tenantId, idOf(data, "staffId")!, parseRanges(data)),
  );
}

export async function updateSettingsAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "settings.updated", async (tx) => {
    // Réglages enregistrés d'un seul bouton : l'ouverture de la réservation en ligne en fait partie
    // quand le pack la propose (le champ caché signale que la case était affichée).
    if (data.has("onlineBookingShown")) {
      await setOnlineBooking(tx, tenantId, form.bool(data, "onlineBookingEnabled"));
    }
    return updateBookingSettings(tx, tenantId, {
      minNoticeHours: form.text(data, "minNoticeHours"),
      maxAdvanceDays: form.text(data, "maxAdvanceDays"),
      slotIntervalMinutes: form.text(data, "slotIntervalMinutes"),
      maxServicesPerBooking: form.text(data, "maxServicesPerBooking"),
      cancellationDeadlineHours: form.text(data, "cancellationDeadlineHours"),
      depositEnabled: form.bool(data, "depositEnabled"),
      depositType: form.text(data, "depositType") as "percent",
      depositValue: form.text(data, "depositValue"),
      dailySummaryEnabled: form.bool(data, "dailySummaryEnabled"),
      monthlySummaryEnabled: form.bool(data, "monthlySummaryEnabled"),
      reviewRequestEnabled: form.bool(data, "reviewRequestEnabled"),
    } as never);
  });
}

export async function createRequestAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "update_request.created", (tx, context) =>
    createUpdateRequest(tx, tenantId, context.role === "owner" ? context.userId : null, {
      subject: form.text(data, "subject"),
      message: form.text(data, "message"),
    }),
  );
}

// ─── Paiements (compte Stripe) et codes promo ────────────────────────────────

function paymentsPage(locale: string, tenantId: string) {
  return `${publicAppUrl()}/${locale}/espace/${tenantId}/plus/paiements`;
}

/** Ouvre (ou reprend) les étapes guidées de Stripe pour le compte de l'établissement. */
export async function openStripeOnboarding(rawLocale: string, rawTenantId: string): Promise<string> {
  const tenantId = uuid.parse(rawTenantId);
  const page = paymentsPage(resolveLocale(rawLocale), tenantId);
  try {
    const { url } = await managerPlatformAction(tenantId, "stripe.onboarding", (tx, { businessId }) =>
      startOnboarding(tx, tenantId, businessId, paymentGateway(), {
        returnUrl: `${page}?retour=1`,
        refreshUrl: `${page}/relance`,
      }),
    );
    return url;
  } catch (error) {
    if (error instanceof AppError) return `${page}?erreur=${error.code}`;
    throw error;
  }
}

export async function startStripeOnboardingAction(data: FormData) {
  const tenantId = tenantIdOf(data);
  const locale = resolveLocale(await getLocale());
  redirectTo(await openStripeOnboarding(locale, tenantId));
}

/** Relit l'état du compte Stripe (retour des étapes guidées). */
export async function refreshStripeAccount(tenantId: string) {
  return managerPlatformAction(tenantId, "stripe.refresh", (tx, { businessId }) =>
    refreshAccount(tx, tenantId, businessId, paymentGateway()),
  );
}

function promoValues(data: FormData) {
  return {
    code: form.text(data, "code"),
    discountType: z.enum(["percent", "fixed"]).parse(form.text(data, "discountType")),
    discountValue: form.text(data, "discountValue"),
    validFrom: form.optional(data, "validFrom") ?? "",
    validUntil: form.optional(data, "validUntil") ?? "",
    maxUses: form.optional(data, "maxUses") ?? "",
    isActive: form.bool(data, "isActive"),
  };
}

export async function savePromoCodeAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "promo.saved", (tx) =>
    savePromoCode(tx, tenantId, promoValues(data), idOf(data)),
  );
}

export async function deletePromoCodeAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "promo.deleted", (tx) => deletePromoCode(tx, tenantId, idOf(data)!));
}

// ─── Promotions datées ───────────────────────────────────────────────────────

export async function savePromotionAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "promotion.saved", (tx) =>
    savePromotion(
      tx,
      tenantId,
      {
        title: form.text(data, "title"),
        serviceIds: form.all(data, "serviceIds"),
        discountType: form.text(data, "discountType") as "percent",
        discountValue: form.text(data, "discountValue"),
        startsOn: form.text(data, "startsOn"),
        endsOn: form.text(data, "endsOn"),
      },
      idOf(data),
    ),
  );
}

export async function deletePromotionAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "promotion.deleted", (tx) => deletePromotion(tx, tenantId, idOf(data)!));
}

// ─── Cartes cadeaux ──────────────────────────────────────────────────────────

/** Sur place : la gérante saisit le code et le montant du soin. */
export async function redeemGiftCardAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const result = await managerMutation(tenantId, "gift_card.redeemed", (tx, { userId }) =>
    redeemOnSite(
      tx,
      tenantId,
      { code: form.text(data, "code"), amount: form.text(data, "amount"), note: form.optional(data, "note") },
      userId,
    ),
  );
  if (result.ok && result.data) {
    const t = await getTranslations("manager.giftCards");
    const amount = new Intl.NumberFormat(await getLocale(), {
      style: "currency",
      currency: result.data.currency,
    }).format(result.data.balanceCents / 100);
    return { ...result, message: t("redeemed", { last4: result.data.codeLast4, balance: amount }) };
  }
  return result;
}

export async function saveGiftCardSettingsAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "gift_card.settings", (tx) =>
    updateGiftCardSettings(tx, tenantId, {
      enabled: form.bool(data, "enabled"),
      validityMonths: form.text(data, "validityMonths") as unknown as number,
      amounts: form.text(data, "amounts"),
      min: form.text(data, "min"),
      max: form.text(data, "max"),
    }),
  );
}

// ─── Abonnement ──────────────────────────────────────────────────────────────

function subscriptionPage(locale: string, tenantId: string) {
  return `${publicAppUrl()}/${locale}/espace/${tenantId}/plus/abonnement`;
}

/** Changement de pack : page de paiement Stripe depuis le Basic, sinon changement direct. */
export async function changeSubscriptionAction(data: FormData) {
  const tenantId = tenantIdOf(data);
  const planId = uuid.parse(form.text(data, "planId"));
  const locale = resolveLocale(await getLocale());
  const page = subscriptionPage(locale, tenantId);
  let target: string;
  try {
    const result = await managerPlatformAction(
      tenantId,
      "subscription.change",
      async (tx, { businessId }) => {
        await assertPrimaryBusiness(tx, tenantId, businessId);
        return requestPlanChange(tx, tenantId, planId, billingGateway(), {
          successUrl: `${page}?retour=ok`,
          cancelUrl: `${page}?retour=annule`,
          // Formule choisie à la souscription (avec engagement par défaut), et périodicité.
          withCommitment: data.get("commitment") !== "no",
          interval: parseInterval(data.get("billing")),
        });
      },
    );
    target = result.kind === "redirect" ? result.url : `${page}?resultat=${result.kind}`;
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    target = `${page}?erreur=${error.code}`;
  }
  redirectTo(target);
}

/** Pack de SMS supplémentaires : page de paiement Stripe (rien n'est facturé sans ce geste). */
export async function buySmsPackAction(data: FormData) {
  const tenantId = tenantIdOf(data);
  const locale = resolveLocale(await getLocale());
  const page = subscriptionPage(locale, tenantId);
  let target: string;
  try {
    target = await managerPlatformAction(
      tenantId,
      "sms.pack_purchase",
      async (tx, { businessId, userId }) => {
        await assertPrimaryBusiness(tx, tenantId, businessId);
        return startSmsPackPurchase(
          tx,
          tenantId,
          {
            userId,
            // Stripe remplace {CHECKOUT_SESSION_ID} : le pack est crédité dès le retour.
            successUrl: `${page}?sms=ok&paiement={CHECKOUT_SESSION_ID}#sms`,
            cancelUrl: `${page}?sms=annule#sms`,
          },
          billingGateway(),
        );
      },
    );
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    target = `${page}?erreur=${error.code}#sms`;
  }
  redirectTo(target);
}

/** Portail Stripe : carte bancaire et factures. */
export async function openBillingPortalAction(data: FormData) {
  const tenantId = tenantIdOf(data);
  const locale = resolveLocale(await getLocale());
  const page = subscriptionPage(locale, tenantId);
  let target: string;
  try {
    target = await managerPlatformAction(tenantId, "subscription.portal", async (tx, { businessId }) => {
      await assertPrimaryBusiness(tx, tenantId, businessId);
      return openBillingPortal(tx, tenantId, billingGateway(), page);
    });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    target = `${page}?erreur=${error.code}`;
  }
  redirectTo(target);
}

// ─── Fidélité et demandes des clientes ───────────────────────────────────────

export async function saveLoyaltySettingsAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const amount = form.optional(data, "rewardAmount");
  return managerMutation(tenantId, "loyalty.settings", (tx) =>
    setLoyaltySettings(tx, tenantId, {
      enabled: form.bool(data, "enabled"),
      visitsRequired: form.text(data, "visitsRequired") as unknown as number,
      rewardLabel: form.optional(data, "rewardLabel"),
      rewardCents: amount ? parseMoney(amount) : undefined,
      validityDays: form.text(data, "validityDays") as unknown as number,
    }),
  );
}

export async function saveBirthdayOfferAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "birthday_offer.settings", (tx) =>
    setBirthdayOffer(tx, tenantId, {
      enabled: form.bool(data, "enabled"),
      discountPercent: form.text(data, "discountPercent"),
      validityDays: form.text(data, "validityDays"),
    }),
  );
}

export async function adjustLoyaltyAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "loyalty.adjusted", (tx, { userId }) =>
    adjustLoyalty(
      tx,
      tenantId,
      idOf(data, "customerId")!,
      { points: form.text(data, "points") as unknown as number, reason: form.text(data, "reason") },
      userId,
    ),
  );
}

export async function useLoyaltyRewardAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "loyalty.reward_used", (tx, { userId }) =>
    redeemReward(tx, tenantId, idOf(data, "rewardId")!, userId),
  );
}

export async function resolveDataRequestAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const status = z.enum(["done", "rejected"]).parse(form.text(data, "status"));
  const t = await getTranslations("manager.customerData");
  return managerMutation(tenantId, `customer_data.${status}`, (tx, { userId }) =>
    resolveDataRequest(tx, tenantId, idOf(data)!, status, userId, t("erasedName")),
  );
}

// ─── Notifications sur le téléphone de la gérante ───

export async function enablePushAction(tenantId: string, device: DeviceInput) {
  const userAgent = (await headers()).get("user-agent");
  return managerPersonalAction(tenantId, (tx, { userId }) => saveDevice(tx, { userId, device, userAgent }));
}

export async function disablePushAction(tenantId: string, endpoint: string) {
  return managerPersonalAction(tenantId, (tx, { userId }) =>
    removeDevice(tx, { userId, endpoint: z.string().max(1000).parse(endpoint) }),
  );
}

export async function testPushAction(tenantId: string) {
  return managerMutation(tenantId, "push.test", (tx, { role, businessId }) => {
    if (role === "admin") throw new AppError("personal_setting");
    return queuePushTest(tx, tenantId, { businessId });
  });
}

export async function renewCalendarFeedAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "calendar_feed.renewed", (tx) => renewCalendarFeed(tx, tenantId));
}

export async function disableCalendarFeedAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "calendar_feed.disabled", (tx) => disableCalendarFeed(tx, tenantId));
}

/** Objectifs du mois (statistiques) : chiffre d'affaires, rendez-vous, nouvelles clientes. */
export async function updateStatsGoalsAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return managerMutation(tenantId, "stats.goals", (tx) =>
    updateStatsGoals(tx, tenantId, {
      revenue: form.text(data, "revenue"),
      appointments: form.text(data, "appointments"),
      newCustomers: form.text(data, "newCustomers"),
    }),
  );
}
