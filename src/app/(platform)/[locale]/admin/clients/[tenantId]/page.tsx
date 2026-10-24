import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, Section, SelectField, TextField } from "@/components/admin/fields";
import { WizardNav } from "@/components/admin/WizardNav";
import { ui } from "@/components/ui/styles";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { listSmsPacks } from "@/modules/billing/sms-packs";
import { getSubscription } from "@/modules/billing/subscriptions";
import { smsUsage } from "@/modules/messages/sms-usage";
import { connectState } from "@/modules/payments/connect";
import { formatPhone } from "@/modules/phone";
import { listPlans } from "@/modules/tenants/queries";
import { READINESS_KEYS, siteReadiness } from "@/modules/tenants/readiness";
import { Link } from "@/i18n/navigation";
import {
  addDomainAction,
  changePlanAction,
  changeStatusAction,
  domainAction,
  sendStripeInviteAction,
} from "../actions";

/** Fiche d'un client : pack, statut, utilisation du mois, gérante, adresses du site. */
export default async function TenantOverviewPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/clients/[tenantId]">) {
  const { locale: rawLocale, tenantId } = await params;
  const locale = resolveLocale(rawLocale);
  const assistant = (await searchParams).assistant === "1";
  const [t, tStatus, overview, plans] = await Promise.all([
    getTranslations("admin.tenant.overview"),
    getTranslations("status"),
    loadTenantOverview(tenantId),
    adminQuery((tx) => listPlans(tx)),
  ]);
  const [subscription, tBilling, sms] = await Promise.all([
    adminQuery((tx) => getSubscription(tx, tenantId)),
    getTranslations("admin.billing"),
    adminQuery(async (tx) => ({
      usage: await smsUsage(tx, tenantId),
      packs: await listSmsPacks(tx, tenantId),
    })),
  ]);
  const { tenant, plan, domains, managers, usage, counts } = overview;
  const [readiness] = await adminQuery((tx) => siteReadiness(tx, [tenantId]));
  const tReady = await getTranslations("admin.tenant.ready");
  /** Où compléter chaque point de la liste de contrôle. */
  const readyHref: Record<(typeof READINESS_KEYS)[number], string> = {
    logo: `/admin/clients/${tenantId}/logo`,
    services: `/admin/clients/${tenantId}/prestations`,
    team: `/admin/clients/${tenantId}/equipe`,
    hours: `/admin/clients/${tenantId}/horaires`,
    manager: `/admin/clients/${tenantId}/entreprises`,
  };
  const limits = plan.limits;
  const usageLine = (used: number, limit: number | null | undefined) =>
    t("usageOf", { used, limit: limit === null || limit === undefined ? t("unlimited") : limit });
  const statusActions = (
    {
      // Site en création : la mise en ligne se fait depuis la liste de contrôle, en haut.
      draft: [],
      active: [{ action: "suspend", label: t("suspend"), hint: t("suspendHint") }],
      cancelled: [{ action: "suspend", label: t("suspend"), hint: t("suspendHint") }],
      suspended: [{ action: "reactivate", label: t("reactivate"), hint: t("activateHint") }],
      deleted: [],
    } as const
  )[tenant.status];

  return (
    <>
      <WizardNav tenantId={tenantId} current="domaine" active={assistant} />

      {/* Site en création : ce qui reste à faire avant la mise en ligne, chaque point menant au bon onglet. */}
      {tenant.status === "draft" && readiness && (
        <section aria-labelledby="pret" className={`${ui.card} space-y-4`}>
          <h2 id="pret" className="text-xl font-bold">
            {tReady("title")}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {READINESS_KEYS.map((key) => (
              <li key={key}>
                <Link
                  href={readyHref[key]}
                  className="flex min-h-11 items-center gap-3 rounded-[var(--radius-card)] border border-navy/10 px-4 py-2 font-semibold text-night hover:bg-ivory"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${readiness.done[key] ? "bg-success/15 text-[#1e6b48]" : "bg-coral/15 text-coral-dark"}`}
                  >
                    {readiness.done[key] ? "✓" : "!"}
                  </span>
                  <span className="flex-1">{tReady(`items.${key}`)}</span>
                  <span className="text-sm font-normal text-ink/60">
                    {readiness.done[key] ? tReady("done") : tReady("todo")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-ink/70">
            {readiness.missing.length === 0 ? tReady("allSet") : tReady("notYet")}
          </p>
          <ActionForm action={changeStatusAction} submitLabel={t("activate")} variant="primary">
            <Hidden values={{ tenantId, statusAction: "activate" }} />
          </ActionForm>
        </section>
      )}
      {tenant.status !== "draft" && counts.members === 0 && (
        <p role="status" className={ui.error}>
          {t("noMembers")}{" "}
          <Link href={`/admin/clients/${tenantId}/equipe`} className="font-semibold underline">
            {tReady("items.team")} →
          </Link>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title={t("status")}
          aside={
            <span className="text-sm text-ink/60">
              {t("created", { date: formatDate(tenant.createdAt, locale) })}
            </span>
          }
        >
          <p className="mb-4 font-semibold">{tStatus(tenant.status)}</p>
          {statusActions.map((item) => (
            <ActionForm
              key={item.action}
              action={changeStatusAction}
              submitLabel={item.label}
              confirm={item.action === "suspend" ? t("suspendConfirm", { name: tenant.name }) : undefined}
              variant={item.action === "suspend" ? "secondary" : "primary"}
            >
              <Hidden values={{ tenantId, statusAction: item.action }} />
              <p className="text-sm text-ink/70">{item.hint}</p>
            </ActionForm>
          ))}
          <p className="mt-4 text-sm text-ink/60">
            {t("countryTimezone", {
              country: tenant.country,
              timezone: tenant.timezone,
              currency: tenant.currency,
            })}
            {tenant.phone ? ` · ${formatPhone(tenant.phone)}` : ""}
          </p>
        </Section>

        <Section title={t("plan")}>
          <ActionForm
            action={changePlanAction}
            submitLabel={t("changePlan")}
            confirm={t("changePlanConfirm", { name: tenant.name })}
            variant="secondary"
          >
            <Hidden values={{ tenantId }} />
            <SelectField
              name="planCode"
              label={t("plan")}
              defaultValue={plan.code}
              options={plans.map((item) => ({ value: item.code, label: pickLocalized(item.name, locale) }))}
              hint={t("changePlanHint")}
            />
          </ActionForm>
          <div className="mt-4 border-t border-navy/10 pt-4 text-sm">
            <p className="font-semibold">{t("subscription")}</p>
            {subscription?.stripeSubscriptionId ? (
              <p className="text-ink/80">
                {tBilling.has(`statuses.${subscription.status}` as "statuses.active")
                  ? tBilling(`statuses.${subscription.status}` as "statuses.active")
                  : subscription.status}
                {subscription.currentPeriodEnd &&
                  ` · ${tBilling("next")} : ${formatDate(subscription.currentPeriodEnd, locale)}`}
                {subscription.commitmentEndsAt &&
                  ` · ${tBilling("commitment", { date: formatDate(subscription.commitmentEndsAt, locale) })}`}
                {subscription.withCommitment === false && ` · ${tBilling("noCommitment")}`}
                {subscription.cancelAt &&
                  ` · ${tBilling("cancelAt", { date: formatDate(subscription.cancelAt, locale) })}`}
              </p>
            ) : (
              <p className="text-ink/70">{t("subscriptionNone")}</p>
            )}
            {subscription?.paymentFailedAt && (
              <p className="font-semibold text-coral-dark">
                {tBilling("failedOn", { date: formatDate(subscription.paymentFailedAt, locale) })}
              </p>
            )}
          </div>
        </Section>

        <details className={`${ui.card} lg:col-span-2`}>
          <summary className="cursor-pointer text-xl font-bold">{t("usage")}</summary>
          <div className="mt-4">
            <dl className="grid grid-cols-2 gap-4">
              {[
                {
                  label: t("onlineBookings"),
                  value: usageLine(usage?.onlineBookings ?? 0, limits.onlineBookingsPerMonth),
                },
                { label: t("services"), value: usageLine(counts.services, limits.services) },
                { label: t("members"), value: usageLine(counts.members, limits.members) },
                { label: t("photos"), value: usageLine(counts.photos, limits.photos) },
                { label: t("smsQuota"), value: usageLine(sms.usage?.used ?? 0, limits.smsPerMonth) },
                { label: t("smsFromPacks"), value: String(sms.usage?.fromPacks ?? 0) },
                { label: t("smsPacksRemaining"), value: String(sms.usage?.packsRemaining ?? 0) },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-sm text-ink/70">{item.label}</dt>
                  <dd className="text-xl font-bold text-night">{item.value}</dd>
                </div>
              ))}
            </dl>
            {sms.packs.length > 0 && (
              <div className="mt-4 border-t border-navy/10 pt-4 text-sm">
                <p className="font-semibold">{t("smsPacks")}</p>
                <ul className="mt-1 space-y-1 text-ink/80">
                  {sms.packs.map((pack) => (
                    <li key={pack.id}>
                      {t("smsPackLine", {
                        date: pack.paidAt ? formatDate(pack.paidAt, locale) : "",
                        count: pack.quantity,
                        amount: formatMoney(pack.priceCents, pack.currency, locale),
                        remaining: pack.remaining,
                        status: pack.status,
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>

        <Section title={t("businesses")}>
          <ul className="space-y-3">
            {overview.businesses.map((business) => {
              const stripe = connectState(business, plan.features);
              return (
                <li key={business.id} className="space-y-2">
                  <div>
                    <p className="font-semibold">{business.name}</p>
                    <p className="text-sm text-ink/70">
                      {[business.siret, t(`stripeState.${stripe}`)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {/* Compte à ouvrir ou à terminer : c'est la gérante qui le fait, on lui envoie le lien. */}
                  {(stripe === "not_started" || stripe === "incomplete") && (
                    <ActionForm
                      action={sendStripeInviteAction}
                      submitLabel={t("stripeInvite")}
                      variant="secondary"
                    >
                      <Hidden values={{ tenantId, businessId: business.id }} />
                      <p className="text-sm text-ink/70">{t("stripeInviteHint")}</p>
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title={t("managers")}>
          <ul className="space-y-2">
            {managers.map((manager) => (
              <li key={manager.id}>
                {manager.name && <p className="font-semibold">{manager.name}</p>}
                <p className={manager.name ? "text-sm text-ink/70" : "font-semibold"}>{manager.email}</p>
                <p className="text-sm text-ink/70">
                  {" "}
                  {manager.lastLoginAt
                    ? t("lastLogin", { date: formatDateTime(manager.lastLoginAt, locale, tenant.timezone) })
                    : t("neverLoggedIn")}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <section id="domaines" className={ui.card}>
        <h2 className="mb-4 text-xl font-bold">{t("domains")}</h2>
        <ul className="divide-y divide-navy/10">
          {domains.map((domain) => (
            <li key={domain.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold">{domain.hostname}</p>
                <p className="text-sm text-ink/70">
                  {domain.isPrimary ? `${t("primary")} · ` : ""}
                  {t(domain.status)}
                </p>
              </div>
              {domain.type === "custom" && (
                <div className="flex flex-wrap gap-4">
                  {domain.status !== "active" && (
                    <ActionForm
                      action={domainAction}
                      submitLabel={t("markActive")}
                      confirm={t("markActiveConfirm", { host: domain.hostname })}
                      variant="link"
                      className=""
                    >
                      <Hidden values={{ tenantId, domainId: domain.id, operation: "activate" }} />
                    </ActionForm>
                  )}
                  {domain.status === "active" && !domain.isPrimary && (
                    <ActionForm
                      action={domainAction}
                      submitLabel={t("makePrimary")}
                      variant="link"
                      className=""
                    >
                      <Hidden values={{ tenantId, domainId: domain.id, operation: "primary" }} />
                    </ActionForm>
                  )}
                  <ActionForm
                    action={domainAction}
                    submitLabel={t("removeDomain")}
                    variant="danger"
                    className=""
                    confirm={t("removeDomainConfirm", { host: domain.hostname })}
                  >
                    <Hidden values={{ tenantId, domainId: domain.id, operation: "remove" }} />
                  </ActionForm>
                </div>
              )}
              {domain.type === "subdomain" && !domain.isPrimary && (
                <ActionForm action={domainAction} submitLabel={t("makePrimary")} variant="link" className="">
                  <Hidden values={{ tenantId, domainId: domain.id, operation: "primary" }} />
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
        {plan.features.customDomain ? (
          <ActionForm
            action={addDomainAction}
            submitLabel={t("addDomain")}
            variant="secondary"
            resetOnSuccess
            className="mt-4 space-y-3"
          >
            <Hidden values={{ tenantId }} />
            <TextField
              name="hostname"
              label={t("addDomain")}
              placeholder={t("domainPlaceholder")}
              hint={t("markActiveHint")}
            />
          </ActionForm>
        ) : (
          <p className="mt-4 text-sm text-ink/70">{t("noCustomDomain")}</p>
        )}
      </section>
    </>
  );
}
