import { tenantFeatures, tenantLimits } from "@/modules/billing/entitlements";
import { appointmentEvent, googleCalendarUrl } from "@/lib/calendar/appointment";
import { and, asc, eq, sql } from "drizzle-orm";
import { declareBusiness } from "@/db/access";
import type { Transaction } from "@/db/client";
import {
  appointmentItems,
  appointments,
  customers,
  memberships,
  messageLog,
  orders,
  plans,
  staffMembers,
  tenantDomains,
  pushSubscriptions,
  businessSettings,
  businesses,
  giftCards,
  tenants,
  users,
  type PlanFeatures,
  type PlanLimits,
} from "@/db/schema";
import { pickLocalized, type Locale } from "@/i18n/locales";
import { getTranslator, resolveLocale } from "@/i18n/translator";
import { tenantSiteUrl } from "@/lib/tenancy/urls";
import { manageTokenFor } from "@/modules/booking/create";
import { loginCodeForMessage } from "@/modules/customer-space/auth";
import { giftCardCodeFor } from "@/modules/giftcards/giftcards";
import { addMinutes } from "@/modules/booking/time";
import { depositSummary } from "@/modules/payments/refunds";
import { formatPhone } from "@/modules/phone";
import { getPlatformSetting } from "@/modules/settings";
import { monthStats } from "@/modules/stats/month";
import { writeReviewUrl } from "@/modules/reviews/google";
import { appointmentCalendarPath, SITE_PATHS } from "@/modules/site/paths";
import { renderEmail } from "./layout";
import type { MessageTemplate } from "./queue";
import { fitSingleSms, smsSenderName, toGsm7 } from "./senders";
import { dailyAgenda } from "./summaries";

/**
 * Prépare le contenu d'un message de la file, au moment de l'envoi, avec les
 * données à jour (rôle plateforme). Les messages aux clientes partent au nom de
 * l'établissement, dans la langue de la cliente ; ceux aux gérantes, au nom du SaaS.
 */

export type MessageRow = typeof messageLog.$inferSelect;

export type Rendered =
  | {
      kind: "email";
      to: string[];
      subject: string;
      html: string;
      text: string;
      fromName: string;
      replyTo: string | null;
    }
  | { kind: "sms"; to: string; sender: string; text: string }
  | {
      kind: "push";
      devices: { id: string; endpoint: string; p256dh: string; auth: string }[];
      title: string;
      body: string;
      url: string;
      tag: string;
    }
  | { kind: "skip"; reason: string };

export type RenderOptions = { productName: string; appUrl: string; now: Date };

type Translator = Awaited<ReturnType<typeof getTranslator>>;

async function loadTenant(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .select({ tenant: tenants, features: tenantFeatures, limits: tenantLimits })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.id, tenantId));
  if (!row) return null;
  const [domain] = await tx
    .select({ hostname: tenantDomains.hostname })
    .from(tenantDomains)
    .where(
      and(
        eq(tenantDomains.tenantId, tenantId),
        eq(tenantDomains.isPrimary, true),
        eq(tenantDomains.status, "active"),
      ),
    );
  return {
    ...row.tenant,
    features: row.features as PlanFeatures,
    limits: row.limits as PlanLimits,
    siteUrl: domain ? tenantSiteUrl(domain.hostname) : null,
    color: row.tenant.brand.colors?.primary ?? null,
  };
}

type TenantInfo = NonNullable<Awaited<ReturnType<typeof loadTenant>>>;

async function loadAppointment(tx: Transaction, tenantId: string, appointmentId: string, locale: Locale) {
  const [row] = await tx
    .select({ appointment: appointments, customer: customers, staffName: staffMembers.name })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .innerJoin(staffMembers, eq(staffMembers.id, appointments.staffId))
    .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, appointmentId)));
  if (!row) return null;
  const items = await tx
    .select({ name: appointmentItems.serviceName })
    .from(appointmentItems)
    .where(eq(appointmentItems.appointmentId, appointmentId))
    .orderBy(asc(appointmentItems.position));
  return {
    ...row,
    services: items.map((item) => pickLocalized(item.name, locale)),
    deposit: await depositSummary(tx, tenantId, appointmentId),
  };
}

type AppointmentInfo = NonNullable<Awaited<ReturnType<typeof loadAppointment>>>;

function formatters(locale: Locale, timeZone: string) {
  const date = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone });
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone });
  return {
    date: (value: Date) => date.format(value),
    time: (value: Date) => time.format(value),
    when: (t: Translator, value: Date) =>
      t("notifications.common.when", { date: date.format(value), time: time.format(value) }),
    money: (cents: number, currency: string) =>
      new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100),
  };
}

/** Pied de page des e-mails aux clientes : coordonnées de l'établissement. */
function tenantFooter(tenant: TenantInfo) {
  const address = [tenant.addressLine1, [tenant.postalCode, tenant.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [tenant.name, address, tenant.phone ? formatPhone(tenant.phone) : ""].filter(Boolean);
}

function appointmentDetails(
  t: Translator,
  fmt: ReturnType<typeof formatters>,
  info: AppointmentInfo,
  { withMoney = true } = {},
) {
  const a = info.appointment;
  const details = [
    { label: t("notifications.common.date"), value: fmt.when(t, a.startsAt) },
    { label: t("notifications.common.with"), value: info.staffName },
    { label: t("notifications.common.services"), value: info.services.join(", ") },
  ];
  if (withMoney) {
    if (a.discountCents > 0)
      details.push({
        label: t("notifications.common.discount"),
        value: `− ${fmt.money(a.discountCents, a.currency)}`,
      });
    details.push({ label: t("notifications.common.total"), value: fmt.money(a.totalCents, a.currency) });
    if (info.deposit?.status === "succeeded")
      details.push({
        label: t("notifications.common.depositPaid"),
        value: fmt.money(info.deposit.amountCents, info.deposit.currency),
      });
  }
  return details;
}

function customerName(customer: AppointmentInfo["customer"]) {
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ");
}

/**
 * Destinataires d'un message aux gérantes : celles de l'entreprise concernée ;
 * pour l'abonnement (réglé par l'entreprise principale), celles de l'entreprise
 * principale ; sinon (quota du site), toutes les gérantes du site.
 */
async function managerEmails(tx: Transaction, tenantId: string, row: MessageRow) {
  // Abonnement et SMS (achetés par l'entreprise principale) : ses gérantes.
  const subscription =
    row.templateKey === "manager.payment_failed" ||
    row.templateKey === "manager.subscription_ended" ||
    row.templateKey === "manager.price_change" ||
    row.templateKey === "manager.sms_quota" ||
    row.templateKey === "manager.usage_quota";
  const rows = await tx
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(businesses, eq(businesses.id, memberships.businessId))
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        row.businessId ? eq(memberships.businessId, row.businessId) : undefined,
        !row.businessId && subscription ? eq(businesses.isPrimary, true) : undefined,
      ),
    );
  return [...new Set(rows.map((row) => row.email).filter(Boolean))];
}

/** Téléphones et ordinateurs abonnés des gérantes concernées (mêmes personnes que pour l'e-mail). */
async function managerDevices(tx: Transaction, tenantId: string, row: MessageRow) {
  return tx
    .selectDistinct({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .innerJoin(memberships, eq(memberships.userId, pushSubscriptions.userId))
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        row.businessId ? eq(memberships.businessId, row.businessId) : undefined,
      ),
    );
}

export async function renderMessage(
  tx: Transaction,
  row: MessageRow,
  options: RenderOptions,
): Promise<Rendered> {
  const template = row.templateKey as MessageTemplate;
  if (template === "admin.callback_request") return renderCallback(tx, row, options);
  if (template.startsWith("account.") || template.startsWith("admin."))
    return renderAccount(tx, row, template, options);
  if (!row.tenantId) return { kind: "skip", reason: "no_tenant" };
  // Message d'une entreprise : seules ses données (agenda, réglages…) sont lues.
  await declareBusiness(tx, row.businessId);
  const tenant = await loadTenant(tx, row.tenantId);
  if (!tenant) return { kind: "skip", reason: "no_tenant" };
  if (template === "customer.gift_card" || template === "customer.gift_card_receipt")
    return renderGiftCard(tx, row, template, tenant, options);
  if (template === "customer.login_link" || template === "customer.login_code")
    return renderLogin(tx, row, tenant, options);
  if (template.startsWith("manager.")) return renderManager(tx, row, template, tenant, options);
  return renderCustomer(tx, row, template, tenant, options);
}

// ─── Cartes cadeaux ───────────────────────────────────────────────────────────

async function loadGiftCard(tx: Transaction, row: MessageRow) {
  const giftCardId = (row.data as { giftCardId?: string }).giftCardId;
  if (!giftCardId) return null;
  const [found] = await tx
    .select({
      card: giftCards,
      businessName: businesses.name,
      multi: sql<boolean>`(select count(*) > 1 from ${businesses} b where b.tenant_id = ${giftCards.tenantId})`,
    })
    .from(giftCards)
    .innerJoin(businesses, eq(businesses.id, giftCards.businessId))
    .where(eq(giftCards.id, giftCardId));
  return found ?? null;
}

/** La carte (au destinataire, à la date choisie) et le reçu (à l'acheteuse, tout de suite). */
async function renderGiftCard(
  tx: Transaction,
  row: MessageRow,
  template: MessageTemplate,
  tenant: TenantInfo,
  options: RenderOptions,
): Promise<Rendered> {
  const found = await loadGiftCard(tx, row);
  if (!found || found.card.status !== "active") return { kind: "skip", reason: "no_gift_card" };
  const { card } = found;
  const locale = resolveLocale(row.locale);
  const t = await getTranslator(locale);
  const fmt = formatters(locale, tenant.timezone);
  const siteUrl = tenant.siteUrl ?? options.appUrl;
  const amount = fmt.money(card.initialCents, card.currency);
  const where = found.multi
    ? t("notifications.giftCard.atBusiness", { business: tenant.name, name: found.businessName })
    : tenant.name;
  const validity = t("notifications.giftCard.validUntil", { date: fmt.date(card.expiresAt) });
  let to: string;
  let subject: string;
  let title: string;
  let paragraphs: string[];
  let details: { label: string; value: string }[];
  if (template === "customer.gift_card") {
    to = card.recipientEmail ?? card.purchaserEmail;
    const name = card.recipientName || "";
    subject = t("notifications.giftCard.subject", { from: card.purchaserName, business: tenant.name });
    title = t("notifications.giftCard.title");
    paragraphs = [
      name ? t("notifications.common.hello", { name }) : "",
      t("notifications.giftCard.intro", { from: card.purchaserName, amount, where }),
      ...(card.message ? [`« ${card.message} »`] : []),
    ].filter(Boolean);
    details = [
      { label: t("notifications.giftCard.code"), value: giftCardCodeFor(card.id) },
      { label: t("notifications.giftCard.amount"), value: amount },
      { label: t("notifications.giftCard.validity"), value: validity },
    ];
  } else {
    to = card.purchaserEmail;
    subject = t("notifications.giftCard.receiptSubject", { business: tenant.name });
    title = t("notifications.giftCard.receiptTitle");
    paragraphs = [
      t("notifications.common.hello", { name: card.purchaserName }),
      t("notifications.giftCard.receiptIntro", { amount, where }),
      card.sendAt > options.now
        ? t("notifications.giftCard.receiptScheduled", {
            email: card.recipientEmail ?? card.purchaserEmail,
            date: fmt.date(card.sendAt),
          })
        : t("notifications.giftCard.receiptSent", { email: card.recipientEmail ?? card.purchaserEmail }),
    ];
    details = [
      { label: t("notifications.giftCard.amount"), value: amount },
      { label: t("notifications.giftCard.codeEnd"), value: `•••• ${card.codeLast4}` },
      { label: t("notifications.giftCard.validity"), value: validity },
    ];
  }
  const { html, text } = renderEmail({
    locale,
    brandName: tenant.name,
    color: tenant.color,
    title,
    paragraphs,
    details,
    action: { label: t("notifications.giftCard.book"), url: `${siteUrl}${SITE_PATHS.booking}` },
    after: [t("notifications.giftCard.howTo"), t("notifications.giftCard.rules")],
    footer: tenantFooter(tenant),
  });
  return { kind: "email", to: [to], subject, html, text, fromName: tenant.name, replyTo: tenant.email };
}

// ─── Connexion à l'espace des clientes ────────────────────────────────────────

/** Lien (e-mail) ou code (SMS) de connexion, au nom de l'établissement. Rien s'il a expiré ou servi. */
async function renderLogin(
  tx: Transaction,
  row: MessageRow,
  tenant: TenantInfo,
  options: RenderOptions,
): Promise<Rendered> {
  const loginCodeId = (row.data as { loginCodeId?: string }).loginCodeId;
  const code = loginCodeId ? await loginCodeForMessage(tx, loginCodeId) : null;
  if (!code || code.usedAt || code.expiresAt <= options.now) return { kind: "skip", reason: "login_expired" };
  const locale = resolveLocale(row.locale);
  const t = await getTranslator(locale);
  const minutes = Math.round((code.expiresAt.getTime() - code.createdAt.getTime()) / 60_000);
  if (code.channel === "sms") {
    return {
      kind: "sms",
      to: code.identifier,
      sender: smsSenderName(tenant.name, options.productName),
      text: toGsm7(
        t("notifications.customer.login_code.text", {
          code: code.secret,
          business: tenant.name,
          minutes,
        }),
      ),
    };
  }
  const siteUrl = tenant.siteUrl ?? options.appUrl;
  const { html, text } = renderEmail({
    locale,
    brandName: tenant.name,
    color: tenant.color,
    title: t("notifications.customer.login_link.title"),
    paragraphs: [t("notifications.customer.login_link.intro", { business: tenant.name })],
    action: {
      label: t("notifications.customer.login_link.action"),
      url: `${siteUrl}${SITE_PATHS.account}/connexion?jeton=${code.secret}`,
    },
    after: [
      t("notifications.customer.login_link.expiry", { minutes }),
      t("notifications.customer.login_link.ignore"),
    ],
    footer: tenantFooter(tenant),
  });
  return {
    kind: "email",
    to: [code.identifier],
    subject: t("notifications.customer.login_link.subject", { business: tenant.name }),
    html,
    text,
    fromName: tenant.name,
    replyTo: tenant.email,
  };
}

// ─── Messages aux clientes ────────────────────────────────────────────────────

async function renderCustomer(
  tx: Transaction,
  row: MessageRow,
  template: MessageTemplate,
  tenant: TenantInfo,
  options: RenderOptions,
): Promise<Rendered> {
  if (!row.appointmentId) return { kind: "skip", reason: "no_appointment" };
  const locale = resolveLocale(row.locale);
  const info = await loadAppointment(tx, tenant.id, row.appointmentId, locale);
  if (!info) return { kind: "skip", reason: "no_appointment" };
  const t = await getTranslator(locale);
  const fmt = formatters(locale, tenant.timezone);
  const a = info.appointment;
  const business = tenant.name;
  const siteUrl = tenant.siteUrl ?? options.appUrl;
  const data = row.data as {
    refundedCents?: number;
    by?: string;
    previousStartsAt?: string;
    depositKept?: boolean;
  };

  // Un rappel ou une confirmation n'a plus de sens si le rendez-vous a été annulé ou est passé.
  const needsConfirmed: MessageTemplate[] = [
    "customer.confirmation",
    "customer.reminder_email",
    "customer.reminder_sms",
    "customer.rescheduled",
    "customer.moved",
  ];
  if (needsConfirmed.includes(template) && a.status !== "confirmed")
    return { kind: "skip", reason: "not_confirmed" };
  if (template.includes("reminder") && a.startsAt <= options.now) return { kind: "skip", reason: "past" };

  if (template === "customer.reminder_sms") {
    if (!info.customer.phone) return { kind: "skip", reason: "no_phone" };
    const build = (name: string) =>
      t("notifications.customer.reminder_sms.text", { time: fmt.time(a.startsAt), business: name }) +
      (tenant.phone
        ? t("notifications.customer.reminder_sms.phone", { phone: formatPhone(tenant.phone) })
        : "");
    return {
      kind: "sms",
      to: info.customer.phone,
      sender: smsSenderName(business, options.productName),
      // Un seul SMS par rappel : alphabet standard (un « ê » doublerait le prix) et 160 caractères au plus
      // (un nom d'établissement très long est raccourci).
      text: fitSingleSms(build, business),
    };
  }

  if (!info.customer.email) return { kind: "skip", reason: "no_email" };
  const greeting = t("notifications.common.hello", { name: info.customer.firstName });
  const manageUrl = `${siteUrl}${SITE_PATHS.appointment}/${manageTokenFor(a.id)}`;
  const contact = tenant.phone
    ? t("notifications.common.contact", { phone: formatPhone(tenant.phone) })
    : t("notifications.common.contactEmail");
  const rebook = { label: t("notifications.common.rebook"), url: `${siteUrl}${SITE_PATHS.booking}` };
  const manageAction = { label: t("notifications.common.manage"), url: manageUrl };
  // Espace des clientes (pack qui l'inclut) : « Retrouvez tous vos rendez-vous sur … ».
  const spaceLine = tenant.features.customerSpace
    ? [t("notifications.common.spaceHint", { url: `${siteUrl}${SITE_PATHS.account}` })]
    : [];
  const refundLine = (cents: number | undefined) =>
    cents && cents > 0 ? [t("notifications.common.refund", { amount: fmt.money(cents, a.currency) })] : [];

  let subject: string;
  let title: string;
  let paragraphs: string[];
  let details: { label: string; value: string }[] | undefined = appointmentDetails(t, fmt, info);
  let action: { label: string; url: string } | null = manageAction;
  let after: string[] = [];
  // Rendez-vous confirmé : l'ajouter à l'agenda du téléphone (fichier du site, ou Google Agenda).
  const calendarLinks = [
    {
      label: t("notifications.common.addToCalendar"),
      url: `${siteUrl}${appointmentCalendarPath(manageTokenFor(a.id))}`,
    },
    {
      label: t("notifications.common.googleCalendar"),
      url: googleCalendarUrl(
        appointmentEvent({
          id: a.id,
          start: a.startsAt,
          end: a.endsAt,
          services: info.services,
          businessName: business,
          address: [tenant.addressLine1, [tenant.postalCode, tenant.city].filter(Boolean).join(" ")]
            .filter(Boolean)
            .join(", "),
          manageUrl,
          host: new URL(siteUrl).host,
        }),
      ),
    },
  ];
  let links: { label: string; url: string }[] = [];

  switch (template) {
    case "customer.confirmation":
      subject = t("notifications.customer.confirmation.subject", { date: fmt.date(a.startsAt) });
      title = t("notifications.customer.confirmation.title");
      paragraphs = [greeting, t("notifications.customer.confirmation.intro", { business })];
      links = calendarLinks;
      after = [await manageHint(tx, t, fmt, info, tenant, options.now), ...spaceLine];
      break;
    case "customer.reminder_email":
      subject = t("notifications.customer.reminder_email.subject", {
        date: fmt.date(a.startsAt),
        time: fmt.time(a.startsAt),
      });
      title = t("notifications.customer.reminder_email.title");
      paragraphs = [greeting, t("notifications.customer.reminder_email.intro", { business })];
      after = [await manageHint(tx, t, fmt, info, tenant, options.now), ...spaceLine];
      break;
    case "customer.cancelled":
      subject = t("notifications.customer.cancelled.subject", { date: fmt.date(a.startsAt) });
      title = t("notifications.customer.cancelled.title");
      paragraphs = [
        greeting,
        data.by === "customer"
          ? t("notifications.customer.cancelled.byCustomer", { business, when: fmt.when(t, a.startsAt) })
          : t("notifications.customer.cancelled.byEstablishment", {
              business,
              when: fmt.when(t, a.startsAt),
            }),
        ...refundLine(data.refundedCents),
        ...(data.depositKept ? [t("notifications.customer.cancelled.depositContact", { business })] : []),
      ];
      details = undefined;
      action = rebook;
      break;
    case "customer.rescheduled":
    case "customer.moved": {
      const previous = data.previousStartsAt ? fmt.when(t, new Date(data.previousStartsAt)) : "";
      const key = template === "customer.rescheduled" ? "rescheduled" : "moved";
      subject = t(`notifications.customer.${key}.subject`, { date: fmt.date(a.startsAt) });
      title = t(`notifications.customer.${key}.title`);
      paragraphs = [greeting, t(`notifications.customer.${key}.intro`, { business, previous })];
      links = calendarLinks;
      after = [await manageHint(tx, t, fmt, info, tenant, options.now)];
      break;
    }
    case "customer.review_request": {
      // La gérante a corrigé (absente, à venir) avant l'envoi : plus de demande.
      if (a.status !== "attended") return { kind: "skip", reason: "not_attended" };
      const [listing] = await tx
        .select({ placeId: businesses.googlePlaceId })
        .from(businesses)
        .where(and(eq(businesses.tenantId, tenant.id), eq(businesses.id, a.businessId)));
      if (!listing?.placeId) return { kind: "skip", reason: "no_place" };
      subject = t("notifications.customer.review_request.subject", { business });
      title = t("notifications.customer.review_request.title");
      paragraphs = [
        greeting,
        t("notifications.customer.review_request.intro", { business }),
        t("notifications.customer.review_request.ask"),
      ];
      details = undefined;
      action = {
        label: t("notifications.customer.review_request.action"),
        url: writeReviewUrl(listing.placeId),
      };
      after = [t("notifications.customer.review_request.once")];
      break;
    }
    case "customer.payment_refunded":
      subject = t("notifications.customer.payment_refunded.subject");
      title = t("notifications.customer.payment_refunded.title");
      paragraphs = [
        greeting,
        t("notifications.customer.payment_refunded.intro", { business }),
        ...refundLine(data.refundedCents),
      ];
      details = undefined;
      action = rebook;
      break;
    default:
      return { kind: "skip", reason: "unknown_template" };
  }

  const { html, text } = renderEmail({
    locale,
    brandName: business,
    color: tenant.color,
    title,
    paragraphs,
    details,
    action,
    links,
    after: [...after, contact],
    footer: tenantFooter(tenant),
  });
  return {
    kind: "email",
    to: [info.customer.email],
    subject,
    html,
    text,
    fromName: business,
    replyTo: tenant.email,
  };
}

/** « Annulation gratuite jusqu'au … » ou, si le délai est passé, « contactez l'établissement ». */
async function manageHint(
  tx: Transaction,
  t: Translator,
  fmt: ReturnType<typeof formatters>,
  info: AppointmentInfo,
  tenant: TenantInfo,
  now: Date,
) {
  const [settings] = await tx
    .select({ hours: businessSettings.cancellationDeadlineHours })
    .from(businessSettings)
    .where(eq(businessSettings.tenantId, tenant.id));
  const deadline = addMinutes(info.appointment.startsAt, -(settings?.hours ?? 24) * 60);
  return deadline > now
    ? t("notifications.common.manageHint", { deadline: fmt.when(t, deadline) })
    : t("notifications.common.tooLateHint");
}

// ─── Messages aux gérantes ────────────────────────────────────────────────────

async function renderManager(
  tx: Transaction,
  row: MessageRow,
  template: MessageTemplate,
  tenant: TenantInfo,
  options: RenderOptions,
): Promise<Rendered> {
  const to = await managerEmails(tx, tenant.id, row);
  if (to.length === 0) return { kind: "skip", reason: "no_manager" };
  const locale = resolveLocale(tenant.defaultLocale);
  const t = await getTranslator(locale);
  const fmt = formatters(locale, tenant.timezone);
  const space = `${options.appUrl}/${locale}/espace/${tenant.id}`;
  const data = row.data as {
    refundedCents?: number;
    previousStartsAt?: string;
    date?: string;
    period?: string;
    used?: number;
    limit?: number;
  };
  const footer = [t("notifications.common.managerFooter", { product: options.productName })];
  if (template === "manager.daily_summary" || template === "manager.monthly_summary")
    footer.push(t("notifications.common.summaryFooter"));

  let subject: string;
  let title: string;
  let paragraphs: string[] = [];
  let details: { label: string; value: string }[] | undefined;
  let list: string[] | undefined;
  let action: { label: string; url: string };

  if (
    template === "manager.new_booking" ||
    template === "manager.cancelled" ||
    template === "manager.rescheduled"
  ) {
    if (!row.appointmentId) return { kind: "skip", reason: "no_appointment" };
    const info = await loadAppointment(tx, tenant.id, row.appointmentId, locale);
    if (!info) return { kind: "skip", reason: "no_appointment" };
    const a = info.appointment;
    const customer = customerName(info.customer);
    const when = fmt.when(t, a.startsAt);
    details = appointmentDetails(t, fmt, info);
    action = { label: t("notifications.common.openSpace"), url: `${space}/rendez-vous/${a.id}` };
    if (template === "manager.new_booking") {
      if (a.status !== "confirmed") return { kind: "skip", reason: "not_confirmed" };
      subject = t("notifications.manager.new_booking.subject", { customer, when });
      title = t("notifications.manager.new_booking.title");
      paragraphs = [t("notifications.manager.new_booking.intro", { customer })];
    } else if (template === "manager.cancelled") {
      subject = t("notifications.manager.cancelled.subject", { customer, when });
      title = t("notifications.manager.cancelled.title");
      const refunded = info.deposit?.refundedCents ?? 0;
      paragraphs = [
        t("notifications.manager.cancelled.intro", { customer, when }),
        ...(refunded > 0
          ? [t("notifications.manager.cancelled.refund", { amount: fmt.money(refunded, a.currency) })]
          : []),
      ];
    } else {
      const previous = data.previousStartsAt ? fmt.when(t, new Date(data.previousStartsAt)) : "";
      subject = t("notifications.manager.rescheduled.subject", { customer, when });
      title = t("notifications.manager.rescheduled.title");
      paragraphs = [t("notifications.manager.rescheduled.intro", { customer, previous })];
    }
  } else if (template === "manager.daily_summary") {
    const date = data.date;
    if (!date) return { kind: "skip", reason: "no_date" };
    const day = await dailyAgenda(tx, tenant.id, date, tenant.timezone, locale);
    if (day.length === 0) return { kind: "skip", reason: "empty_day" };
    subject = t("notifications.manager.daily_summary.subject", { count: day.length });
    title = t("notifications.manager.daily_summary.title");
    paragraphs = [t("notifications.manager.daily_summary.intro", { date: fmt.date(day[0].startsAt) })];
    list = day.map((item) =>
      t("notifications.manager.daily_summary.line", {
        time: fmt.time(item.startsAt),
        customer: item.customer,
        services: item.services.join(" + "),
        staff: item.staff,
      }),
    );
    action = { label: t("notifications.manager.daily_summary.open"), url: `${space}/agenda?date=${date}` };
  } else if (template === "manager.monthly_summary") {
    if (!data.period) return { kind: "skip", reason: "no_period" };
    const stats = await monthStats(tx, tenant.id, data.period, tenant.timezone, locale);
    const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${data.period}-15T12:00:00Z`),
    );
    subject = t("notifications.manager.monthly_summary.subject", { month });
    title = t("notifications.manager.monthly_summary.title", { month });
    details = [
      { label: t("notifications.manager.monthly_summary.appointments"), value: String(stats.appointments) },
      { label: t("notifications.manager.monthly_summary.online"), value: String(stats.online) },
      {
        label: t("notifications.manager.monthly_summary.revenue"),
        value: fmt.money(stats.revenueCents, tenant.currency),
      },
      { label: t("notifications.manager.monthly_summary.newCustomers"), value: String(stats.newCustomers) },
      { label: t("notifications.manager.monthly_summary.cancelled"), value: String(stats.cancelled) },
      { label: t("notifications.manager.monthly_summary.noShows"), value: String(stats.noShows) },
    ];
    if (stats.topServices.length > 0) {
      paragraphs = [t("notifications.manager.monthly_summary.top")];
      list = stats.topServices.map(([name, count]) => `${name} (${count})`);
    }
    action = { label: t("notifications.manager.monthly_summary.open"), url: `${space}/plus/statistiques` };
  } else if (template === "manager.basic_quota") {
    const used = data.used ?? 0;
    const limit = data.limit ?? 0;
    const reached = used >= limit;
    subject = reached
      ? t("notifications.manager.basic_quota.subjectReached")
      : t("notifications.manager.basic_quota.subjectAlmost");
    title = subject;
    paragraphs = [
      reached
        ? t("notifications.manager.basic_quota.reached", { limit })
        : t("notifications.manager.basic_quota.almost", { used, limit }),
      t("notifications.manager.basic_quota.upgrade"),
    ];
    action = { label: t("notifications.manager.basic_quota.open"), url: `${space}/plus/abonnement` };
  } else if (template === "manager.gift_card_sold") {
    const found = await loadGiftCard(tx, row);
    if (!found) return { kind: "skip", reason: "no_gift_card" };
    const amount = fmt.money(found.card.initialCents, found.card.currency);
    subject = t("notifications.manager.gift_card_sold.subject", { amount });
    title = t("notifications.manager.gift_card_sold.title");
    paragraphs = [
      t("notifications.manager.gift_card_sold.intro", { name: found.card.purchaserName, amount }),
    ];
    details = [
      { label: t("notifications.giftCard.codeEnd"), value: `•••• ${found.card.codeLast4}` },
      { label: t("notifications.giftCard.validity"), value: fmt.date(found.card.expiresAt) },
    ];
    action = { label: t("notifications.manager.gift_card_sold.open"), url: `${space}/plus/cartes-cadeaux` };
  } else if (template === "manager.data_request") {
    const kind = (row.data as { kind?: string }).kind === "deletion" ? "deletion" : "export";
    const name = (row.data as { customerName?: string }).customerName ?? "";
    subject = t(`notifications.manager.data_request.subject_${kind}`, { customer: name });
    title = t(`notifications.manager.data_request.title_${kind}`);
    paragraphs = [
      t(`notifications.manager.data_request.intro_${kind}`, { customer: name }),
      t("notifications.manager.data_request.delay"),
    ];
    action = {
      label: t("notifications.manager.data_request.open"),
      url: `${space}/plus/donnees-clientes`,
    };
  } else if (template === "manager.stripe_invite") {
    const resume = (row.data as { state?: string }).state === "incomplete";
    subject = t("notifications.manager.stripe_invite.subject");
    title = t("notifications.manager.stripe_invite.title");
    paragraphs = [
      t(
        resume
          ? "notifications.manager.stripe_invite.introResume"
          : "notifications.manager.stripe_invite.intro",
      ),
      t("notifications.manager.stripe_invite.steps"),
      t("notifications.manager.stripe_invite.money"),
      t("notifications.manager.stripe_invite.login"),
    ];
    action = { label: t("notifications.manager.stripe_invite.open"), url: `${space}/plus/paiements` };
  } else if (template === "manager.push_test") {
    subject = t("notifications.manager.push_test.body");
    title = subject;
    paragraphs = [];
    action = { label: title, url: `${space}/notifications` };
  } else if (template === "manager.sms_quota") {
    const data = row.data as { level?: number; used?: number; limit?: number; resetsOn?: string };
    const reached = (data.level ?? 0) >= 100;
    const resetsOn = data.resetsOn ? fmt.date(new Date(`${data.resetsOn}T12:00:00Z`)) : "";
    subject = reached
      ? t("notifications.manager.sms_quota.subjectReached")
      : t("notifications.manager.sms_quota.subjectAlmost", { percent: data.level ?? 0 });
    title = subject;
    paragraphs = [
      reached
        ? t("notifications.manager.sms_quota.reached", { limit: data.limit ?? 0, date: resetsOn })
        : t("notifications.manager.sms_quota.almost", {
            used: data.used ?? 0,
            limit: data.limit ?? 0,
            date: resetsOn,
          }),
      t("notifications.manager.sms_quota.email"),
      t("notifications.manager.sms_quota.packs"),
    ];
    action = { label: t("notifications.manager.sms_quota.open"), url: `${space}/plus/abonnement` };
  } else if (template === "manager.usage_quota") {
    // Quota mensuel d'un outil (chatbot, WhatsApp, textes ou images générés).
    const data = row.data as {
      key?: string;
      level?: number;
      used?: number;
      limit?: number;
      resetsOn?: string;
    };
    const reached = (data.level ?? 0) >= 100;
    const resetsOn = data.resetsOn ? fmt.date(new Date(`${data.resetsOn}T12:00:00Z`)) : "";
    const tool = t(
      `notifications.manager.usage_quota.keys.${data.key ?? "aiTexts"}` as "notifications.manager.usage_quota.keys.aiTexts",
    );
    subject = reached
      ? t("notifications.manager.usage_quota.subjectReached", { tool })
      : t("notifications.manager.usage_quota.subjectAlmost", { tool, percent: data.level ?? 0 });
    title = subject;
    paragraphs = [
      t(reached ? "notifications.manager.usage_quota.reached" : "notifications.manager.usage_quota.almost", {
        used: data.used ?? 0,
        limit: data.limit ?? 0,
        date: resetsOn,
      }),
      t("notifications.manager.usage_quota.noCharge"),
    ];
    action = { label: t("notifications.manager.usage_quota.open"), url: `${space}/plus/abonnement` };
  } else if (template === "manager.payment_failed") {
    subject = t("notifications.manager.payment_failed.subject");
    title = t("notifications.manager.payment_failed.title");
    paragraphs = [
      t("notifications.manager.payment_failed.intro"),
      t("notifications.manager.payment_failed.action"),
    ];
    action = { label: t("notifications.manager.payment_failed.open"), url: `${space}/plus/abonnement` };
  } else if (template === "manager.price_change") {
    // Nouveau prix du pack : annoncé à l'avance, appliqué à la date prévue (fin d'engagement).
    const data = row.data as { planId?: string; priceCents?: number; interval?: string; changeAt?: string };
    const [plan] = data.planId ? await tx.select().from(plans).where(eq(plans.id, data.planId)) : [];
    subject = t("notifications.manager.price_change.subject");
    title = t("notifications.manager.price_change.title");
    paragraphs = [
      t("notifications.manager.price_change.intro", {
        plan: plan ? pickLocalized(plan.name, locale) : "",
        price: fmt.money(data.priceCents ?? 0, "EUR"),
        interval: data.interval === "year" ? "year" : "month",
        date: data.changeAt ? fmt.date(new Date(data.changeAt)) : "",
      }),
      t("notifications.manager.price_change.until"),
      t("notifications.manager.price_change.choice"),
    ];
    action = { label: t("notifications.manager.price_change.open"), url: `${space}/plus/abonnement` };
  } else if (template === "manager.subscription_ended") {
    const { reason, paused } = row.data as { reason?: string; paused?: boolean };
    const mode = { paused: paused ? "yes" : "no" };
    subject = t("notifications.manager.subscription_ended.subject", mode);
    title = t("notifications.manager.subscription_ended.title", mode);
    paragraphs = [
      reason === "unpaid"
        ? t("notifications.manager.subscription_ended.unpaid", mode)
        : t("notifications.manager.subscription_ended.requested", mode),
      t("notifications.manager.subscription_ended.back"),
    ];
    action = { label: t("notifications.manager.subscription_ended.open"), url: `${space}/plus/abonnement` };
  } else {
    return { kind: "skip", reason: "unknown_template" };
  }

  // Notification sur les téléphones : le nom de l'établissement, l'objet de l'e-mail, la même page.
  if (row.channel === "push") {
    const devices = await managerDevices(tx, tenant.id, row);
    if (devices.length === 0) return { kind: "skip", reason: "no_device" };
    return {
      kind: "push",
      devices,
      title: tenant.name,
      body: subject,
      url: action.url,
      tag: row.appointmentId ?? row.id,
    };
  }

  const { html, text } = renderEmail({
    locale,
    brandName: options.productName,
    title,
    paragraphs,
    details,
    list,
    action,
    footer: [tenant.name, ...footer],
  });
  return { kind: "email", to, subject, html, text, fromName: options.productName, replyTo: null };
}

// ─── Demande « Être rappelé » (commande en ligne fermée) ─────────────────────

async function renderCallback(tx: Transaction, row: MessageRow, options: RenderOptions): Promise<Rendered> {
  const admins = await tx.select({ email: users.email }).from(users).where(eq(users.isPlatformAdmin, true));
  if (admins.length === 0) return { kind: "skip", reason: "no_admin" };
  const data = row.data as {
    name?: string;
    businessName?: string;
    phone?: string;
    email?: string;
    planCode?: string;
    message?: string;
  };
  const locale = resolveLocale("fr");
  const t = await getTranslator(locale);
  const [plan] = data.planCode ? await tx.select().from(plans).where(eq(plans.code, data.planCode)) : [];
  const details = [
    { label: t("notifications.admin.callback_request.name"), value: data.name ?? "" },
    {
      label: t("notifications.admin.callback_request.phone"),
      value: formatPhone(data.phone) || data.phone || "",
    },
    ...(data.businessName
      ? [{ label: t("notifications.admin.callback_request.business"), value: data.businessName }]
      : []),
    ...(data.email ? [{ label: t("notifications.admin.callback_request.email"), value: data.email }] : []),
    ...(plan
      ? [{ label: t("notifications.admin.callback_request.plan"), value: pickLocalized(plan.name, locale) }]
      : []),
    ...(data.message
      ? [{ label: t("notifications.admin.callback_request.message"), value: data.message }]
      : []),
  ];
  const { html, text } = renderEmail({
    locale,
    brandName: options.productName,
    title: t("notifications.admin.callback_request.title"),
    paragraphs: [t("notifications.admin.callback_request.intro")],
    details,
    footer: [options.productName],
  });
  return {
    kind: "email",
    to: admins.map((admin) => admin.email),
    subject: t("notifications.admin.callback_request.subject", { name: data.name ?? "" }),
    html,
    text,
    fromName: options.productName,
    replyTo: data.email || null,
  };
}

// ─── Commandes : au professionnel (avant son site) et à l'administratrice ────

async function renderAccount(
  tx: Transaction,
  row: MessageRow,
  template: MessageTemplate,
  options: RenderOptions,
): Promise<Rendered> {
  const orderId = (row.data as { orderId?: string }).orderId;
  if (!orderId) return { kind: "skip", reason: "no_order" };
  const [found] = await tx
    .select({ order: orders, plan: plans, email: users.email })
    .from(orders)
    .innerJoin(plans, eq(plans.id, orders.planId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.id, orderId));
  if (!found) return { kind: "skip", reason: "no_order" };
  const { order, plan } = found;
  const product = options.productName;

  if (template === "admin.new_order") {
    const admins = await tx.select({ email: users.email }).from(users).where(eq(users.isPlatformAdmin, true));
    if (admins.length === 0) return { kind: "skip", reason: "no_admin" };
    const locale = resolveLocale("fr");
    const t = await getTranslator(locale);
    const planName = pickLocalized(plan.name, locale);
    const { html, text } = renderEmail({
      locale,
      brandName: product,
      title: t("notifications.admin.new_order.title"),
      paragraphs: [
        order.paidAt ? t("notifications.admin.new_order.paid") : t("notifications.admin.new_order.review"),
      ],
      details: [
        { label: t("notifications.admin.new_order.business"), value: order.businessName },
        { label: t("notifications.admin.new_order.activity"), value: order.activity },
        { label: t("notifications.admin.new_order.phone"), value: formatPhone(order.phone) || order.phone },
        { label: t("notifications.admin.new_order.email"), value: found.email },
        ...(order.currentWebsite
          ? [{ label: t("notifications.admin.new_order.website"), value: order.currentWebsite }]
          : []),
      ],
      action: {
        label: t("notifications.admin.new_order.open"),
        url: `${options.appUrl}/${locale}/admin/commandes`,
      },
      footer: [product],
    });
    return {
      kind: "email",
      to: admins.map((admin) => admin.email),
      subject: t("notifications.admin.new_order.subject", { business: order.businessName, plan: planName }),
      html,
      text,
      fromName: product,
      replyTo: found.email,
    };
  }

  const locale = resolveLocale(row.locale);
  const t = await getTranslator(locale);
  const planName = pickLocalized(plan.name, locale);
  const space = `${options.appUrl}/${locale}/espace`;
  let subject: string;
  let title: string;
  let paragraphs: string[];
  let action: { label: string; url: string } | null = null;
  if (template === "account.order_received") {
    const days = Number(await getPlatformSetting(tx, "go_live_delay_days"));
    subject = t("notifications.account.order_received.subject", { product });
    title = t("notifications.account.order_received.title");
    paragraphs = [
      order.paidAt
        ? t("notifications.account.order_received.paid", { plan: planName })
        : t("notifications.account.order_received.review", { plan: planName }),
      t("notifications.account.order_received.next", { days }),
    ];
    action = { label: t("notifications.account.order_received.open"), url: space };
  } else if (template === "account.order_rejected") {
    subject = t("notifications.account.order_rejected.subject", { product });
    title = t("notifications.account.order_rejected.title");
    paragraphs = [
      t("notifications.account.order_rejected.intro", { business: order.businessName }),
      ...(order.rejectionReason
        ? [t("notifications.account.order_rejected.reason", { reason: order.rejectionReason })]
        : []),
      ...(order.paidAt ? [t("notifications.account.order_rejected.refund")] : []),
      t("notifications.account.order_rejected.contact"),
    ];
  } else if (template === "account.site_live") {
    const tenant = row.tenantId ? await loadTenant(tx, row.tenantId) : null;
    subject = t("notifications.account.site_live.subject");
    title = t("notifications.account.site_live.title");
    paragraphs = [
      t("notifications.account.site_live.intro", { business: tenant?.name ?? order.businessName }),
      t("notifications.account.site_live.space"),
    ];
    action = tenant?.siteUrl
      ? { label: t("notifications.account.site_live.site"), url: tenant.siteUrl }
      : null;
  } else {
    return { kind: "skip", reason: "unknown_template" };
  }
  const { html, text } = renderEmail({
    locale,
    brandName: product,
    title,
    paragraphs,
    action,
    after:
      template === "account.site_live"
        ? [`${t("notifications.account.order_received.open")} : ${space}`]
        : [],
    footer: [product],
  });
  return { kind: "email", to: [found.email], subject, html, text, fromName: product, replyTo: null };
}
