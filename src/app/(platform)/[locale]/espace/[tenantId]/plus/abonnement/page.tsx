import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ui } from "@/components/ui/styles";
import { usageCounters } from "@/db/schema";
import { pickLocalized } from "@/i18n/locales";
import { managerPage } from "@/lib/manager/page";
import { billingGateway } from "@/lib/payments/stripe-billing";
import { listPublicPlans, planHighlights } from "@/modules/billing/plans";
import { getSubscription, isLive } from "@/modules/billing/subscriptions";
import type { AppErrorCode } from "@/modules/errors";
import { countUsage } from "@/modules/quotas";
import { getPlatformSetting } from "@/modules/settings";
import { currentPeriod } from "@/modules/tenants/queries";
import { changeSubscriptionAction, openBillingPortalAction } from "../../actions";

const RESULTS = ["upgraded", "downgraded", "downgrade_scheduled", "cancel_scheduled", "kept"] as const;

/** Pack, échéances, utilisation du mois, changement de pack et carte bancaire. */
export default async function SubscriptionPage({
  params,
  searchParams,
}: PageProps<"/[locale]/espace/[tenantId]/plus/abonnement">) {
  const page = await managerPage(params);
  const query = await searchParams;
  const [t, tErrors] = await Promise.all([
    getTranslations("manager.subscription"),
    getTranslations("errors"),
  ]);
  const data = await page.db(async (tx) => {
    const [counter] = await tx
      .select()
      .from(usageCounters)
      .where(
        and(
          eq(usageCounters.tenantId, page.tenantId),
          eq(usageCounters.period, currentPeriod(page.tenant.timezone)),
        ),
      );
    return {
      usage: {
        onlineBookings: counter?.onlineBookings ?? 0,
        sms: counter?.smsSent ?? 0,
        members: await countUsage(tx, page.tenantId, "members"),
        photos: await countUsage(tx, page.tenantId, "photos"),
        services: await countUsage(tx, page.tenantId, "services"),
      },
      subscription: await getSubscription(tx, page.tenantId),
      plans: await listPublicPlans(tx),
      display: await getPlatformSetting(tx, "prices_display"),
      setupFeeCents: Number(await getPlatformSetting(tx, "setup_fee_cents")),
      commitmentMonths: Number(await getPlatformSetting(tx, "commitment_months")),
    };
  });
  const { usage, subscription, display } = data;
  const limits = page.tenant.limits;
  const current = data.plans.find((plan) => plan.id === page.tenant.planId);
  const currentPrice = current?.priceCents ?? 0;
  const live = subscription && isLive(subscription.status) ? subscription : null;
  // Site à plusieurs entreprises : l'abonnement est réglé par l'entreprise principale.
  const canManage = page.business.isPrimary;
  const configured = billingGateway() !== null && canManage;
  const scheduled = data.plans.find((plan) => plan.id === live?.scheduledPlanId);
  const periodEnd = live?.currentPeriodEnd ?? null;
  const freeDate = [periodEnd, live?.commitmentEndsAt]
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const priceLabel = (cents: number) =>
    cents > 0 ? t("perMonth", { amount: page.fmt.money(cents), display }) : t("free");
  const error = typeof query.erreur === "string" ? (query.erreur as AppErrorCode) : null;
  const result = RESULTS.find((item) => item === query.resultat);

  const rows = [
    { label: t("onlineBookings"), used: usage.onlineBookings, limit: limits.onlineBookingsPerMonth },
    { label: t("sms"), used: usage.sms, limit: limits.smsPerMonth },
    { label: t("members"), used: usage.members, limit: limits.members },
    { label: t("photos"), used: usage.photos, limit: limits.photos },
    { label: t("services"), used: usage.services, limit: limits.services },
  ];

  const keepForm = canManage && (
    <form action={changeSubscriptionAction} className="mt-3">
      <input type="hidden" name="tenantId" value={page.tenantId} />
      <input type="hidden" name="planId" value={page.tenant.planId} />
      <SubmitButton className={`${ui.secondaryButton} sm:w-auto`}>{t("status.keep")}</SubmitButton>
    </form>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>

      {error && (
        <p role="alert" className={ui.error}>
          {tErrors.has(error) ? tErrors(error) : tErrors("invalid")}
        </p>
      )}
      {query.retour === "ok" && (
        <p role="status" className={ui.success}>
          {t("returnOk")}
        </p>
      )}
      {query.retour === "annule" && (
        <p role="status" className={ui.error}>
          {t("returnCancel")}
        </p>
      )}
      {result && (
        <p role="status" className={ui.success}>
          {t(`result.${result}`)}
        </p>
      )}
      {live?.paymentFailedAt && (
        <p role="alert" className={ui.error}>
          {t("pastDue")}
        </p>
      )}

      {!canManage && (
        <p role="status" className={ui.card}>
          {t("primaryOnly")}
        </p>
      )}

      <section className={ui.card}>
        <p className="text-xl font-bold text-night">
          {t("plan", { name: pickLocalized(page.tenant.planName, page.locale) })}
        </p>
        <div className="mt-2 space-y-1 text-ink/80">
          {/* Sans abonnement : pack gratuit, ou pack payant attribué par notre équipe (pas de prélèvement). */}
          {!live && <p>{currentPrice > 0 ? t("status.assigned") : t("status.free")}</p>}
          {live && periodEnd && !live.cancelAt && (
            <p>
              {t("status.nextPayment", {
                date: page.fmt.short(periodEnd),
                amount: page.fmt.money(scheduled?.priceCents ?? currentPrice),
              })}
            </p>
          )}
          {live?.commitmentEndsAt && live.commitmentEndsAt > new Date() && (
            <p>{t("status.commitment", { date: page.fmt.short(live.commitmentEndsAt) })}</p>
          )}
        </div>
        {scheduled && periodEnd && (
          <div className="mt-4 rounded-[var(--radius-card)] bg-ivory p-4">
            <p>
              {t("status.scheduled", {
                name: pickLocalized(scheduled.name, page.locale),
                date: page.fmt.short(periodEnd),
              })}
            </p>
            {keepForm}
          </div>
        )}
        {live?.cancelAt && (
          <div className="mt-4 rounded-[var(--radius-card)] bg-ivory p-4">
            <p>{t("status.cancelAt", { date: page.fmt.short(live.cancelAt) })}</p>
            {keepForm}
          </div>
        )}
        {subscription?.stripeCustomerId && configured && (
          <form action={openBillingPortalAction} className="mt-4">
            <input type="hidden" name="tenantId" value={page.tenantId} />
            <SubmitButton className={`${ui.secondaryButton} sm:w-auto`}>{t("portal")} ↗</SubmitButton>
          </form>
        )}

        <h2 className="mt-6 font-semibold">{t("usage")}</h2>
        <ul className="mt-2 divide-y divide-navy/10">
          {rows.map((row) => {
            const over = row.limit !== null && row.limit !== undefined && row.used > row.limit;
            return (
              <li key={row.label} className="py-3">
                <div className="flex justify-between gap-3">
                  <span>{row.label}</span>
                  <span className={`text-right font-semibold ${over ? "text-coral-dark" : ""}`}>
                    {row.limit === null || row.limit === undefined
                      ? `${row.used} · ${t("unlimited")}`
                      : t("of", { used: row.used, limit: row.limit })}
                  </span>
                </div>
                {over && <p className="mt-1 text-sm text-coral-dark">{t("overLimit")}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">{t("choose")}</h2>
        {!configured && canManage && <p className="text-ink/70">{t("unavailable")}</p>}
        {data.plans.map((plan) => {
          const isCurrent = plan.id === page.tenant.planId;
          const upgrade = plan.priceCents > currentPrice;
          const toFree = plan.priceCents <= 0;
          const hint = isCurrent
            ? null
            : !live
              ? plan.priceCents > 0
                ? t("subscribeHint")
                : null
              : toFree
                ? t("toFreeHint", { date: freeDate ? page.fmt.short(freeDate) : "" })
                : upgrade
                  ? t("upgradeHint")
                  : t("downgradeHint", { date: periodEnd ? page.fmt.short(periodEnd) : "" });
          // Pack gratuit : choisi directement quand le pack actuel est payant (abonnement ou attribué).
          const canChoose = configured && !isCurrent && (live || plan.priceCents > 0 || currentPrice > 0);
          return (
            <article
              key={plan.id}
              className={`${ui.card} ${isCurrent ? "ring-2 ring-navy" : ""}`}
              aria-current={isCurrent ? "true" : undefined}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-bold text-night">{pickLocalized(plan.name, page.locale)}</h3>
                <p className="font-semibold">{priceLabel(plan.priceCents)}</p>
              </div>
              {isCurrent && <p className="text-sm font-semibold text-success">{t("current")}</p>}
              <ul className="mt-3 grid gap-1 text-sm text-ink/80 sm:grid-cols-2">
                {planHighlights(plan).map((item) => (
                  <li key={item.key}>
                    ✓{" "}
                    {item.kind === "limit"
                      ? t(`limits.${item.key}`, { count: item.count })
                      : t(`features.${item.key}`)}
                  </li>
                ))}
              </ul>
              {!live && plan.priceCents > 0 && !isCurrent && (
                <p className="mt-3 text-sm text-ink/70">
                  {data.commitmentMonths > 0 && `${t("commitmentInfo", { months: data.commitmentMonths })} `}
                  {data.setupFeeCents > 0 && t("setupFee", { amount: page.fmt.money(data.setupFeeCents) })}
                </p>
              )}
              {canChoose && (
                <form action={changeSubscriptionAction} className="mt-4 space-y-2">
                  <input type="hidden" name="tenantId" value={page.tenantId} />
                  <input type="hidden" name="planId" value={plan.id} />
                  {hint && <p className="text-sm text-ink/70">{hint}</p>}
                  <SubmitButton
                    className={`${upgrade || !live ? ui.primaryButton : ui.secondaryButton} sm:w-auto`}
                    confirm={
                      live && upgrade
                        ? t("upgradeConfirm")
                        : live && toFree
                          ? t("toFreeConfirm", { date: freeDate ? page.fmt.short(freeDate) : "" })
                          : undefined
                    }
                  >
                    {!live ? t("subscribe") : toFree ? t("toFree") : upgrade ? t("upgrade") : t("downgrade")}
                  </SubmitButton>
                </form>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
