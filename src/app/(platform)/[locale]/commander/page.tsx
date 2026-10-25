import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { TextField } from "@/components/admin/fields";
import { OrderChoices } from "@/components/marketing/OrderChoices";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { ui } from "@/components/ui/styles";
import { withPlatform } from "@/db/access";
import { pickLocalized } from "@/i18n/locales";
import { Link, redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { getManagedTenants, requireSession } from "@/lib/auth/session";
import { listLaunchOffers } from "@/modules/billing/launch-offers";
import { parseInterval } from "@/modules/billing/yearly";
import { listPlanOptions, pricedOption } from "@/modules/billing/options";
import { listPublicPlans } from "@/modules/billing/plans";
import { formatMoney } from "@/lib/format";
import { salesOpen } from "@/modules/legal/documents";
import { getPlatformSetting } from "@/modules/settings";
import { submitOrderAction } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/commander">): Promise<Metadata> {
  const t = await getTranslations({ locale: resolveLocale((await params).locale), namespace: "order" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * Commande : le pack choisi sur l'accueil, puis un court formulaire.
 * Sans compte, la connexion (ou l'inscription) se fait d'abord, puis retour ici.
 */
export default async function OrderPage({ params, searchParams }: PageProps<"/[locale]/commander">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const query = await searchParams;
  const pack = typeof query.pack === "string" ? query.pack : "";
  // Pages légales pas encore publiées : les packs payants passent par « Être rappelé ».
  const { open, free } = await withPlatform(async (tx) => ({
    open: await salesOpen(tx),
    free: (await listPublicPlans(tx)).filter((plan) => plan.priceCents <= 0).map((plan) => plan.code),
  }));
  if (!open && !free.includes(pack)) {
    // Le choix mensuel ou annuel suit la demande de rappel.
    const billing = query.billing === "year" ? { billing: "year" } : {};
    redirect({ href: { pathname: "/rappel", query: pack ? { pack, ...billing } : billing }, locale });
  }
  const session = await requireSession(
    locale,
    pack
      ? `/commander?pack=${encodeURIComponent(pack)}${query.billing === "year" ? "&billing=year" : ""}`
      : "/commander",
  );
  // Déjà cliente : le changement de pack se fait depuis son espace.
  if ((await getManagedTenants(session.user.id)).length > 0) redirect({ href: "/espace", locale });
  const [t, tHome] = await Promise.all([getTranslations("order"), getTranslations("home.plans")]);
  const { plans, options, display, commitment, noCommitment, offers, yearly } = await withPlatform(
    async (tx) => ({
      offers: await listLaunchOffers(tx, { openOnly: true }),
      plans: await listPublicPlans(tx),
      options: await listPlanOptions(tx),
      display: String(await getPlatformSetting(tx, "prices_display")),
      commitment: Number(await getPlatformSetting(tx, "commitment_months")),
      noCommitment: Boolean(await getPlatformSetting(tx, "offer_no_commitment")),
      yearly: {
        enabled: Boolean(await getPlatformSetting(tx, "yearly_billing_enabled")),
        freeMonths: Number(await getPlatformSetting(tx, "yearly_free_months")),
      },
    }),
  );
  // Options choisies sur l'accueil (?options=booking,online-payment), reprises dans le formulaire.
  const initialOptions = typeof query.options === "string" ? query.options.split(",").slice(0, 20) : [];
  // Vente fermée : seuls les packs gratuits (s'il y en a) se commandent en ligne.
  const orderable = open ? plans : plans.filter((plan) => plan.priceCents <= 0);
  const selected =
    orderable.find((plan) => plan.code === pack) ??
    orderable.find((plan) => plan.priceCents > 0) ??
    orderable[0];
  const money = (cents: number) => formatMoney(cents, "EUR", locale);

  // Vente fermée et aucun pack gratuit : on propose d'être rappelée.
  if (orderable.length === 0) {
    const tErrors = await getTranslations("errors");
    return (
      <>
        <PlatformHeader />
        <main id="contenu" className="mx-auto max-w-2xl space-y-6 px-4 py-8">
          <h1 className="text-3xl font-extrabold">{t("title")}</h1>
          <div className={`${ui.card} space-y-4`}>
            <p>{tErrors("sales_paused")}</p>
            <Link href="/rappel" className={`${ui.primaryButton} sm:w-auto`}>
              {tHome("callback")}
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PlatformHeader />
      <main id="contenu" className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-3xl font-extrabold">{t("title")}</h1>
          <p className="mt-2 text-ink/80">{t("intro")}</p>
        </div>
        <div className={ui.card}>
          <ActionForm action={submitOrderAction} submitLabel={t("submit")} className="space-y-5">
            <OrderChoices
              plans={orderable.map((plan) => ({
                code: plan.code,
                name: pickLocalized(plan.name, locale),
                priceCents: plan.priceCents,
                // Frais de création propres au pack, payés seulement sans engagement (si cette formule est proposée).
                note:
                  noCommitment && (plan.noCommitmentFeeCents ?? 0) > 0
                    ? t("creationFee", {
                        fee: money(plan.noCommitmentFeeCents!),
                        withCommitment: commitment > 0 ? "yes" : "no",
                      })
                    : null,
              }))}
              options={options.map((option) => ({
                ...pricedOption(option),
                name: pickLocalized(option.name, locale),
                description: pickLocalized(option.description, locale),
                icon: option.icon,
                available: option.isAvailable,
              }))}
              initialPlan={selected?.code ?? ""}
              initialOptions={initialOptions}
              initialBilling={parseInterval(query.billing)}
              yearly={yearly}
              display={display}
              labels={{
                plan: t("plan"),
                options: t("options"),
                optionsHint: t("optionsHint"),
                total: t("total"),
                perMonth: tHome("perMonth", { display }),
                perYear: tHome("perYear", { display }),
                billing: t("billing"),
                monthly: t("billingMonthly"),
                yearly: t("billingYearly", { months: yearly.freeMonths }),
                // La mention des options n'apparaît que si des options se commandent ici.
                yearlyHint: t("billingYearlyHint", {
                  options: options.map(pricedOption).some((o) => o.orderable && o.priceCents !== null)
                    ? "yes"
                    : "no",
                }),
              }}
            />
            {/* Formule des packs payants : avec engagement (création offerte) ou sans (frais de création). */}
            {commitment > 0 && noCommitment && orderable.some((plan) => plan.priceCents > 0) && (
              // À l'année, les 12 mois sont payés d'avance : la formule ne concerne que le mensuel.
              <fieldset data-monthly-only>
                <legend className={ui.label}>{t("formula")}</legend>
                <p className="mb-2 text-sm text-ink/70">{t("formulaHint")}</p>
                {/* Offre de lancement (tablette) : réservée à la formule avec engagement, places réelles. */}
                {offers.map((offer) => {
                  const plan = plans.find((item) => item.code === offer.planCode);
                  return plan ? (
                    <p
                      key={offer.id}
                      className="mb-2 rounded-[var(--radius-card)] bg-navy/5 p-3 text-sm text-night"
                    >
                      {t("launchOffer", {
                        offer: pickLocalized(offer.title, locale),
                        plan: pickLocalized(plan.name, locale),
                        remaining: offer.remaining,
                        commitment: offer.requiresCommitment ? "yes" : "no",
                      })}
                    </p>
                  ) : null;
                })}
                <div className="space-y-2">
                  {[
                    {
                      value: "yes",
                      title: t("withCommitment", { months: commitment }),
                      text: t("withCommitmentFree"),
                    },
                    {
                      value: "no",
                      title: t("withoutCommitment"),
                      text: orderable.some((plan) => (plan.noCommitmentFeeCents ?? 0) > 0)
                        ? t("withoutCommitmentPlanFee")
                        : t("withoutCommitmentFree"),
                    },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border-2 border-navy/15 p-4 has-[:checked]:border-navy"
                    >
                      <input
                        type="radio"
                        name="commitment"
                        value={option.value}
                        defaultChecked={option.value === "yes"}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-navy"
                      />
                      <span>
                        <span className="block font-bold text-night">{option.title}</span>
                        <span className="block text-sm text-ink/70">{option.text}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <TextField name="businessName" label={t("businessName")} required />
            <TextField name="activity" label={t("activity")} hint={t("activityHint")} required />
            <TextField name="phone" type="tel" inputMode="tel" label={t("phone")} required />
            <TextField
              name="currentWebsite"
              inputMode="url"
              label={t("currentWebsite")}
              placeholder={t("currentWebsitePlaceholder")}
            />
            {/* Rappel avant le paiement : la formule ne concerne que les packs payants. */}
            <p className="text-sm text-ink/70">
              {noCommitment || commitment === 0
                ? [t("paidHint"), orderable.some((plan) => plan.priceCents <= 0) && t("freeHint")]
                    .filter(Boolean)
                    .join(" ")
                : t("commitmentHint", { months: commitment })}
            </p>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="acceptTerms"
                required
                className="mt-0.5 h-5 w-5 shrink-0 accent-navy"
              />
              <span>
                {t.rich("terms", {
                  link: (chunks) => (
                    <Link href="/conditions" target="_blank" className="font-semibold underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </label>
          </ActionForm>
        </div>
      </main>
    </>
  );
}
