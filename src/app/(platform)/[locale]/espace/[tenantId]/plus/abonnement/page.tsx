import { and, eq } from "drizzle-orm";
import { splitPlans } from "@/modules/billing/showcase";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ui } from "@/components/ui/styles";
import { withPlatform } from "@/db/access";
import { plans as plansTable, usageCounters } from "@/db/schema";
import { pickLocalized } from "@/i18n/locales";
import { managerPage } from "@/lib/manager/page";
import { dataExportAllowed } from "@/modules/export/business-data";
import { billingGateway } from "@/lib/payments/stripe-billing";
import { listTenantOptions } from "@/modules/billing/options";
import { yearlyPriceCents } from "@/modules/billing/yearly";
import { gridCard, type CardLine } from "@/modules/billing/grid";
import { listPublicPlans } from "@/modules/billing/plans";
import { canBuySmsPacks, listSmsPacks, smsPackOffer, syncSmsPackPayment } from "@/modules/billing/sms-packs";
import { smsUsage } from "@/modules/messages/sms-usage";
import { freePlan, getSubscription, isLive } from "@/modules/billing/subscriptions";
import type { AppErrorCode } from "@/modules/errors";
import { countUsage } from "@/modules/quotas";
import { getPlatformSetting } from "@/modules/settings";
import { currentPeriod } from "@/modules/tenants/queries";
import { buySmsPackAction, changeSubscriptionAction, openBillingPortalAction } from "../../actions";

const RESULTS = ["upgraded", "downgraded", "downgrade_scheduled", "cancel_scheduled", "kept"] as const;

/** Pack, échéances, utilisation du mois, changement de pack et carte bancaire. */
export default async function SubscriptionPage({
  params,
  searchParams,
}: PageProps<"/[locale]/espace/[tenantId]/plus/abonnement">) {
  const page = await managerPage(params);
  const query = await searchParams;
  const [t, tErrors, tGrid, tPlans] = await Promise.all([
    getTranslations("manager.subscription"),
    getTranslations("errors"),
    getTranslations("home.grid"),
    getTranslations("home.plans"),
  ]);
  // Retour de la page de paiement d'un pack de SMS : crédité tout de suite (sans attendre Stripe).
  const smsCheckout = typeof query.paiement === "string" ? query.paiement : null;
  if (query.sms === "ok" && smsCheckout) {
    await withPlatform((tx) => syncSmsPackPayment(tx, page.tenantId, smsCheckout, billingGateway()));
  }
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
        members: await countUsage(tx, page.tenantId, "members"),
        photos: await countUsage(tx, page.tenantId, "photos"),
        services: await countUsage(tx, page.tenantId, "services"),
      },
      subscription: await getSubscription(tx, page.tenantId),
      plans: await listPublicPlans(tx),
      soon: new Set(await getPlatformSetting(tx, "features_soon")),
      // Pack actuel, même s'il n'est plus proposé à la vente (anciens packs).
      currentPlan: (await tx.select().from(plansTable).where(eq(plansTable.id, page.tenant.planId)))[0],
      // Pack gratuit : vendu (on peut y passer) ou hors vente (fin d'abonnement = site en pause).
      freePlan: await freePlan(tx),
      options: await listTenantOptions(tx, page.tenantId),
      display: await getPlatformSetting(tx, "prices_display"),
      commitmentMonths: Number(await getPlatformSetting(tx, "commitment_months")),
      yearly: {
        enabled: Boolean(await getPlatformSetting(tx, "yearly_billing_enabled")),
        freeMonths: Number(await getPlatformSetting(tx, "yearly_free_months")),
      },
      sms: await smsUsage(tx, page.tenantId),
      smsPacks: await listSmsPacks(tx, page.tenantId),
      smsOffer: await smsPackOffer(tx),
      canBuySms: await canBuySmsPacks(tx, page.tenantId),
      warningPercent: Number(await getPlatformSetting(tx, "sms_warning_percent")),
    };
  });
  const { usage, subscription, display, sms } = data;
  const limits = page.tenant.limits;
  const current = data.currentPlan;
  // Lignes des packs : les mêmes que sur les cartes du site commercial (grille unique).
  const lineText = (line: CardLine) => {
    const base = `rows.${line.key}` as "rows.photos";
    if (line.count === null && tGrid.has(`${base}.cardUnlimited` as "rows.photos.cardUnlimited"))
      return tGrid(`${base}.cardUnlimited` as "rows.photos.cardUnlimited");
    return tGrid(`${base}.card` as "rows.photos.card", { count: line.count ?? 0 });
  };
  // L'espace gérante est celui de la solution Réservation (seule ouverte à la souscription).
  const forBooking = (line: CardLine) => !line.solution || line.solution === "booking";
  const planName = (code: string) =>
    pickLocalized(data.plans.find((item) => item.code === code)?.name ?? null, page.locale);
  const currentPrice = current?.priceCents ?? 0;
  const live = subscription && isLive(subscription.status) ? subscription : null;
  const canExport = await page.db((tx) => dataExportAllowed(tx, page.tenantId, page.tenant.features));
  // Bouton d'export dans les encadrés de résiliation (ouvert à tous les packs pendant la résiliation).
  const exportButton = (
    <Link href={`${page.base}/plus/exporter`} className={`${ui.secondaryButton} sm:w-auto`}>
      {t("exportLink")}
    </Link>
  );
  // Site à plusieurs entreprises : l'abonnement est réglé par l'entreprise principale.
  const canManage = page.business.isPrimary;
  const configured = billingGateway() !== null && canManage;
  const scheduled = data.plans.find((plan) => plan.id === live?.scheduledPlanId);
  const periodEnd = live?.currentPeriodEnd ?? null;
  const freeDate = [periodEnd, live?.commitmentEndsAt]
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const pausing = !data.freePlan.isPublic;
  const priceLabel = (cents: number) =>
    cents > 0 ? t("perMonth", { amount: page.fmt.money(cents), display }) : t("free");
  const error = typeof query.erreur === "string" ? (query.erreur as AppErrorCode) : null;
  const result = RESULTS.find((item) => item === query.resultat);

  const rows = [
    { label: t("onlineBookings"), used: usage.onlineBookings, limit: limits.onlineBookingsPerMonth },
    { label: t("members"), used: usage.members, limit: limits.members },
    { label: t("photos"), used: usage.photos, limit: limits.photos },
    { label: t("services"), used: usage.services, limit: limits.services },
  ];

  const keepForm = canManage && (
    <form action={changeSubscriptionAction}>
      <input type="hidden" name="tenantId" value={page.tenantId} />
      <input type="hidden" name="planId" value={page.tenant.planId} />
      <SubmitButton className={`${ui.secondaryButton} sm:w-auto`}>{t("status.keep")}</SubmitButton>
    </form>
  );

  return (
    <div className="space-y-6">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
        {t("title")}
      </h1>

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
      {page.tenant.status === "suspended" && !live && (
        <p role="alert" className={ui.error}>
          {t("paused")}
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
        <p className="text-xl font-semibold text-night">
          {t("plan", { name: pickLocalized(page.tenant.planName, page.locale) })}
        </p>
        <div className="mt-2 space-y-1 text-ink/80">
          {/* Sans abonnement : pack gratuit, ou pack payant attribué par notre équipe (pas de prélèvement). */}
          {!live && <p>{currentPrice > 0 ? t("status.assigned") : t("status.free")}</p>}
          {live && periodEnd && !live.cancelAt && (
            <p>
              {t("status.nextPayment", {
                date: page.fmt.short(periodEnd),
                // À l'année : le montant de l'année (réduction comprise).
                amount: page.fmt.money(
                  live.billingInterval === "year"
                    ? yearlyPriceCents(scheduled?.priceCents ?? currentPrice, data.yearly.freeMonths)
                    : (scheduled?.priceCents ?? currentPrice),
                ),
              })}
            </p>
          )}
          {live && <p>{t("interval", { interval: live.billingInterval })}</p>}
          {live?.commitmentEndsAt && live.commitmentEndsAt > new Date() && (
            <p>{t("status.commitment", { date: page.fmt.short(live.commitmentEndsAt) })}</p>
          )}
          {live && live.withCommitment === false && <p>{t("status.noCommitment")}</p>}
        </div>
        {scheduled && periodEnd && (
          <div className="mt-4 rounded-[var(--radius-card)] bg-mist-50 p-4">
            <p>
              {t("status.scheduled", {
                name: pickLocalized(scheduled.name, page.locale),
                date: page.fmt.short(periodEnd),
              })}
            </p>
            <div className="mt-3">{keepForm}</div>
          </div>
        )}
        {live?.cancelAt && (
          <div className="mt-4 rounded-[var(--radius-card)] bg-mist-50 p-4">
            <p>
              {t("status.cancelAt", { date: page.fmt.short(live.cancelAt), pause: pausing ? "yes" : "no" })}
            </p>
            <p className="mt-2 text-sm text-ink/70">{t("exportBeforeLeaving")}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {exportButton}
              {keepForm}
            </div>
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
                  <span className={`text-right font-semibold ${over ? "text-[#b4372a]" : ""}`}>
                    {row.limit === null || row.limit === undefined
                      ? `${row.used} · ${t("unlimited")}`
                      : t("of", { used: row.used, limit: row.limit })}
                  </span>
                </div>
                {over && <p className="mt-1 text-sm text-[#b4372a]">{t("overLimit")}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      {sms && (
        <section id="sms" className={`${ui.card} scroll-mt-24`} aria-labelledby="titre-sms">
          <h2 id="titre-sms" className="text-xl font-semibold">
            {t("smsTitle")}
          </h2>
          {query.sms === "ok" && (
            <p role="status" className={`${ui.success} mt-3`}>
              {t("smsBought")}
            </p>
          )}
          {query.sms === "annule" && (
            <p role="status" className={`${ui.error} mt-3`}>
              {t("smsCancelled")}
            </p>
          )}
          {sms.limit === 0 ? (
            <p className="mt-2 text-ink/80">{t("smsNone")}</p>
          ) : (
            <>
              {sms.limit !== null && sms.used >= sms.limit && (
                <p role="alert" className={`${ui.error} mt-3`}>
                  {sms.packsRemaining > 0 ? t("smsQuotaReachedPacks") : t("smsQuotaReached")}
                </p>
              )}
              {sms.limit !== null &&
                sms.used < sms.limit &&
                sms.used >= Math.ceil((sms.limit * data.warningPercent) / 100) && (
                  <p role="status" className={`${ui.card} mt-3 border-[#f3d3cc] bg-[#fdf4f2]`}>
                    {t("smsQuotaAlmost", { used: sms.used, limit: sms.limit })}
                  </p>
                )}
              <dl className="mt-3 divide-y divide-navy/10">
                {[
                  {
                    label: t("smsUsed"),
                    value:
                      sms.limit === null ? String(sms.used) : t("of", { used: sms.used, limit: sms.limit }),
                  },
                  {
                    label: t("smsRemaining"),
                    value: sms.remaining === null ? t("unlimited") : String(sms.remaining),
                  },
                  { label: t("smsReset"), value: page.fmt.short(new Date(`${sms.resetsOn}T12:00:00Z`)) },
                  { label: t("smsExtra"), value: String(sms.packsRemaining) },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between gap-3 py-3">
                    <dt>{row.label}</dt>
                    <dd className="text-right font-semibold">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-sm text-ink/70">{t("smsRules")}</p>
              {data.canBuySms && configured && data.smsOffer.priceCents > 0 && (
                <form action={buySmsPackAction} className="mt-4">
                  <input type="hidden" name="tenantId" value={page.tenantId} />
                  <SubmitButton className={`${ui.primaryButton} sm:w-auto`}>
                    {t("smsBuy", {
                      count: data.smsOffer.size,
                      amount: page.fmt.money(data.smsOffer.priceCents),
                    })}
                  </SubmitButton>
                  <p className="mt-2 text-sm text-ink/70">{t("smsBuyHint")}</p>
                </form>
              )}
              {data.smsPacks.length > 0 && (
                <>
                  <h3 className="mt-6 font-semibold">{t("smsPacks")}</h3>
                  <ul className="mt-2 divide-y divide-navy/10 text-sm">
                    {data.smsPacks.map((pack) => (
                      <li key={pack.id} className="flex flex-wrap justify-between gap-2 py-2">
                        <span>
                          {t("smsPackLine", {
                            date: pack.paidAt ? page.fmt.short(pack.paidAt) : "",
                            count: pack.quantity,
                            amount: page.fmt.money(pack.priceCents),
                          })}
                        </span>
                        <span className="text-ink/70">
                          {pack.status === "expired"
                            ? t("smsPackExpired")
                            : t("smsPackRemaining", { count: pack.remaining })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
      )}

      {/* Options actives : ajoutées par notre équipe, facturées avec l'abonnement. */}
      <section className={ui.card} aria-labelledby="titre-options">
        <h2 id="titre-options" className="text-xl font-semibold">
          {t("options")}
        </h2>
        {data.options.length === 0 ? (
          <p className="mt-2 text-ink/70">{t("optionsNone")}</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {data.options.map(({ option }) => (
              <li key={option.id} className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold text-night">{pickLocalized(option.name, page.locale)}</span>
                {option.priceCents !== null && <span>{priceLabel(option.priceCents)}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-ink/70">{t("optionsHint")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("choose")}</h2>
        {!configured && canManage && <p className="text-ink/70">{t("unavailable")}</p>}
        {/* Deux groupes : avec réservation en ligne, puis « site seul » (ajout de la réservation = changer de pack). */}
        {[splitPlans(data.plans).booking, splitPlans(data.plans).siteOnly]
          .filter((group) => group.length > 0)
          .map((group, groupIndex) => (
            <div key={groupIndex} className="space-y-3">
              {splitPlans(data.plans).siteOnly.length > 0 && (
                <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-ink/60">
                  {groupIndex === 0 ? t("groupBooking") : t("groupSiteOnly")}
                </h3>
              )}
              {group.map((plan) => {
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
                const card = gridCard(plan, data.plans, data.soon);
                const canChoose =
                  configured && !isCurrent && (live || plan.priceCents > 0 || currentPrice > 0);
                return (
                  <article
                    key={plan.id}
                    className={`${ui.card} ${isCurrent ? "ring-2 ring-navy" : ""}`}
                    aria-current={isCurrent ? "true" : undefined}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-lg font-semibold text-night">
                        {pickLocalized(plan.name, page.locale)}
                      </h3>
                      <p className="font-semibold">{priceLabel(plan.priceCents)}</p>
                    </div>
                    {isCurrent && <p className="text-sm font-semibold text-success">{t("current")}</p>}
                    {/* Même contenu que les cartes du site commercial (solution Réservation). */}
                    <ul className="mt-3 grid gap-1 text-sm text-ink/80 sm:grid-cols-2">
                      {card.previous && (
                        <li className="font-semibold text-night sm:col-span-2">
                          ✓ {tPlans("everythingIn", { plan: planName(card.previous) })}
                        </li>
                      )}
                      {[...card.included, ...card.upcoming].filter(forBooking).map((item) => (
                        <li key={item.key}>
                          ✓ {lineText(item)}
                          {item.soon && (
                            <span className="ml-1.5 rounded-full bg-navy/5 px-1.5 py-px text-[0.8125rem] text-ink/70">
                              {tPlans("soonTag")}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {!live &&
                      plan.priceCents > 0 &&
                      !isCurrent &&
                      data.commitmentMonths === 0 &&
                      (plan.noCommitmentFeeCents ?? 0) > 0 && (
                        <p className="mt-3 text-sm text-ink/70">
                          {t("setupFee", { amount: page.fmt.money(plan.noCommitmentFeeCents!) })}
                        </p>
                      )}
                    {canChoose && (
                      <form action={changeSubscriptionAction} className="mt-4 space-y-2">
                        <input type="hidden" name="tenantId" value={page.tenantId} />
                        <input type="hidden" name="planId" value={plan.id} />
                        {/* Souscription : chaque mois, ou à l'année avec des mois offerts. */}
                        {!live && plan.priceCents > 0 && data.yearly.enabled && (
                          <fieldset className="space-y-2">
                            <legend className="text-sm font-semibold">{t("billing")}</legend>
                            {(["month", "year"] as const).map((value) => (
                              <label key={value} className="flex items-start gap-3 text-sm">
                                <input
                                  type="radio"
                                  name="billing"
                                  value={value}
                                  defaultChecked={value === "month"}
                                  className="mt-0.5 h-5 w-5 shrink-0 accent-navy"
                                />
                                <span>
                                  {value === "month"
                                    ? t("billingMonthly", {
                                        amount: page.fmt.money(plan.priceCents),
                                        display,
                                      })
                                    : t("billingYearly", {
                                        amount: page.fmt.money(
                                          yearlyPriceCents(plan.priceCents, data.yearly.freeMonths),
                                        ),
                                        months: data.yearly.freeMonths,
                                        display,
                                      })}
                                </span>
                              </label>
                            ))}
                          </fieldset>
                        )}
                        {/* Souscription : avec engagement (création offerte) ou sans (frais de création). */}
                        {!live && plan.priceCents > 0 && data.commitmentMonths > 0 && (
                          <fieldset className="space-y-2">
                            <legend className="text-sm font-semibold">{t("formula")}</legend>
                            {[
                              {
                                value: "yes",
                                label: t("withCommitment", { months: data.commitmentMonths, fee: "none" }),
                              },
                              {
                                value: "no",
                                label: t("withoutCommitment", {
                                  fee: page.fmt.money(plan.noCommitmentFeeCents ?? 0),
                                }),
                              },
                            ].map((option) => (
                              <label key={option.value} className="flex items-start gap-3 text-sm">
                                <input
                                  type="radio"
                                  name="commitment"
                                  value={option.value}
                                  defaultChecked={option.value === "yes"}
                                  className="mt-0.5 h-5 w-5 shrink-0 accent-navy"
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </fieldset>
                        )}
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
                          {!live
                            ? t("subscribe")
                            : toFree
                              ? t("toFree")
                              : upgrade
                                ? t("upgrade")
                                : t("downgrade")}
                        </SubmitButton>
                      </form>
                    )}
                  </article>
                );
              })}
            </div>
          ))}
        {/* Sans pack gratuit à la vente : on arrête l'abonnement, le site est mis en pause à la fin. */}
        {live && pausing && !live.cancelAt && configured && (
          <form action={changeSubscriptionAction} className={`${ui.card} space-y-2`}>
            <input type="hidden" name="tenantId" value={page.tenantId} />
            <input type="hidden" name="planId" value={data.freePlan.id} />
            <h3 className="text-lg font-semibold text-night">{t("stop")}</h3>
            <p className="text-sm text-ink/70">
              {t("stopHint", { date: freeDate ? page.fmt.short(freeDate) : "" })}
            </p>
            <p className="text-sm text-ink/70">{t("exportBeforeLeaving")}</p>
            <div className="flex flex-wrap gap-2">
              <SubmitButton
                className={`${ui.secondaryButton} sm:w-auto`}
                confirm={t("stopConfirm", { date: freeDate ? page.fmt.short(freeDate) : "" })}
              >
                {t("stop")}
              </SubmitButton>
              {exportButton}
            </div>
          </form>
        )}
      </section>
      {/* Avant de changer de pack ou de résilier : la gérante récupère ses données. */}
      <section className={`${ui.card} space-y-2`}>
        <h2 className="text-lg font-semibold text-night">{t("exportTitle")}</h2>
        {canExport ? (
          <>
            <p className="text-sm text-ink/70">{t("exportHint")}</p>
            {exportButton}
          </>
        ) : (
          <p className="text-sm text-ink/70">{t("exportLocked")}</p>
        )}
      </section>
    </div>
  );
}
