import { and, asc, eq } from "drizzle-orm";
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
  businessSettings,
  businesses,
  tenants,
  users,
  type PlanFeatures,
  type PlanLimits,
} from "@/db/schema";
import { pickLocalized, type Locale } from "@/i18n/locales";
import { getTranslator, resolveLocale } from "@/i18n/translator";
import { tenantSiteUrl } from "@/lib/tenancy/urls";
import { manageTokenFor } from "@/modules/booking/create";
import { addMinutes } from "@/modules/booking/time";
import { depositSummary } from "@/modules/payments/refunds";
import { formatPhone } from "@/modules/phone";
import { getPlatformSetting } from "@/modules/settings";
import { monthStats } from "@/modules/stats/month";
import { SITE_PATHS } from "@/modules/site/paths";
import { renderEmail } from "./layout";
import type { MessageTemplate } from "./queue";
import { smsSenderName } from "./senders";
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
  | { kind: "skip"; reason: string };

export type RenderOptions = { productName: string; appUrl: string; now: Date };

type Translator = Awaited<ReturnType<typeof getTranslator>>;

async function loadTenant(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .select({ tenant: tenants, features: plans.features, limits: plans.limits })
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
  const subscription =
    row.templateKey === "manager.payment_failed" || row.templateKey === "manager.subscription_ended";
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

export async function renderMessage(
  tx: Transaction,
  row: MessageRow,
  options: RenderOptions,
): Promise<Rendered> {
  const template = row.templateKey as MessageTemplate;
  if (template.startsWith("account.") || template.startsWith("admin."))
    return renderAccount(tx, row, template, options);
  if (!row.tenantId) return { kind: "skip", reason: "no_tenant" };
  // Message d'une entreprise : seules ses données (agenda, réglages…) sont lues.
  await declareBusiness(tx, row.businessId);
  const tenant = await loadTenant(tx, row.tenantId);
  if (!tenant) return { kind: "skip", reason: "no_tenant" };
  if (template.startsWith("manager.")) return renderManager(tx, row, template, tenant, options);
  return renderCustomer(tx, row, template, tenant, options);
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
  const data = row.data as { refundedCents?: number; by?: string; previousStartsAt?: string };

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
    const text =
      t("notifications.customer.reminder_sms.text", { time: fmt.time(a.startsAt), business }) +
      (tenant.phone
        ? t("notifications.customer.reminder_sms.phone", { phone: formatPhone(tenant.phone) })
        : "");
    return {
      kind: "sms",
      to: info.customer.phone,
      sender: smsSenderName(business, options.productName),
      text,
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
  const refundLine = (cents: number | undefined) =>
    cents && cents > 0 ? [t("notifications.common.refund", { amount: fmt.money(cents, a.currency) })] : [];

  let subject: string;
  let title: string;
  let paragraphs: string[];
  let details: { label: string; value: string }[] | undefined = appointmentDetails(t, fmt, info);
  let action: { label: string; url: string } | null = manageAction;
  let after: string[] = [];

  switch (template) {
    case "customer.confirmation":
      subject = t("notifications.customer.confirmation.subject", { date: fmt.date(a.startsAt) });
      title = t("notifications.customer.confirmation.title");
      paragraphs = [greeting, t("notifications.customer.confirmation.intro", { business })];
      after = [await manageHint(tx, t, fmt, info, tenant)];
      break;
    case "customer.reminder_email":
      subject = t("notifications.customer.reminder_email.subject", {
        date: fmt.date(a.startsAt),
        time: fmt.time(a.startsAt),
      });
      title = t("notifications.customer.reminder_email.title");
      paragraphs = [greeting, t("notifications.customer.reminder_email.intro", { business })];
      after = [await manageHint(tx, t, fmt, info, tenant)];
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
      after = [await manageHint(tx, t, fmt, info, tenant)];
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
) {
  const [settings] = await tx
    .select({ hours: businessSettings.cancellationDeadlineHours })
    .from(businessSettings)
    .where(eq(businessSettings.tenantId, tenant.id));
  const deadline = addMinutes(info.appointment.startsAt, -(settings?.hours ?? 24) * 60);
  return deadline > new Date()
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
  } else if (template === "manager.payment_failed") {
    subject = t("notifications.manager.payment_failed.subject");
    title = t("notifications.manager.payment_failed.title");
    paragraphs = [
      t("notifications.manager.payment_failed.intro"),
      t("notifications.manager.payment_failed.action"),
    ];
    action = { label: t("notifications.manager.payment_failed.open"), url: `${space}/plus/abonnement` };
  } else if (template === "manager.subscription_ended") {
    const reason = (row.data as { reason?: string }).reason;
    subject = t("notifications.manager.subscription_ended.subject");
    title = t("notifications.manager.subscription_ended.title");
    paragraphs = [
      reason === "unpaid"
        ? t("notifications.manager.subscription_ended.unpaid")
        : t("notifications.manager.subscription_ended.requested"),
      t("notifications.manager.subscription_ended.back"),
    ];
    action = { label: t("notifications.manager.subscription_ended.open"), url: `${space}/plus/abonnement` };
  } else {
    return { kind: "skip", reason: "unknown_template" };
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
