import type { Metadata } from "next";
import { splitPlans } from "@/modules/billing/showcase";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { TextField } from "@/components/admin/fields";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { ui } from "@/components/ui/styles";
import { withPlatform } from "@/db/access";
import { pickLocalized } from "@/i18n/locales";
import { Link, redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { getManagedTenants, requireSession } from "@/lib/auth/session";
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
    redirect({ href: { pathname: "/rappel", query: pack ? { pack } : {} }, locale });
  }
  const session = await requireSession(
    locale,
    pack ? `/commander?pack=${encodeURIComponent(pack)}` : "/commander",
  );
  // Déjà cliente : le changement de pack se fait depuis son espace.
  if ((await getManagedTenants(session.user.id)).length > 0) redirect({ href: "/espace", locale });
  const [t, tHome] = await Promise.all([getTranslations("order"), getTranslations("home.plans")]);
  const { plans, display, commitment } = await withPlatform(async (tx) => ({
    plans: await listPublicPlans(tx),
    display: await getPlatformSetting(tx, "prices_display"),
    commitment: Number(await getPlatformSetting(tx, "commitment_months")),
  }));
  // Vente fermée : seuls les packs gratuits se commandent en ligne.
  const orderable = open ? plans : plans.filter((plan) => plan.priceCents <= 0);
  const selected =
    orderable.find((plan) => plan.code === pack) ??
    orderable.find((plan) => plan.priceCents > 0) ??
    orderable[0];
  const groups = splitPlans(orderable);
  const money = (cents: number) => formatMoney(cents, "EUR", locale);

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
            <fieldset>
              <legend className={ui.label}>{t("plan")}</legend>
              {/* Deux groupes : avec réservation en ligne, puis « site seul ». */}
              <div className="space-y-5">
                {[
                  { key: "booking", title: tHome("toggleBooking"), items: groups.booking },
                  { key: "site", title: tHome("toggleSite"), items: groups.siteOnly },
                ]
                  .filter((group) => group.items.length > 0)
                  .map((group) => (
                    <div key={group.key} className="space-y-2">
                      {groups.siteOnly.length > 0 && (
                        <p className="text-sm font-semibold uppercase tracking-wide text-ink/60">
                          {group.title}
                        </p>
                      )}
                      {group.items.map((plan) => (
                        <label
                          key={plan.id}
                          className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-card)] border-2 border-navy/15 p-4 has-[:checked]:border-navy"
                        >
                          <span className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="planCode"
                              value={plan.code}
                              defaultChecked={plan.id === selected?.id}
                              className="h-5 w-5 accent-navy"
                            />
                            <span className="font-bold text-night">{pickLocalized(plan.name, locale)}</span>
                          </span>
                          <span className="text-right">
                            {plan.priceCents > 0
                              ? `${money(plan.priceCents)} ${tHome("perMonth", { display })}`
                              : tHome("free")}
                            {/* Frais de création propres au pack, payés seulement sans engagement. */}
                            {(plan.noCommitmentFeeCents ?? 0) > 0 && (
                              <span className="block text-sm text-ink/70">
                                {t("creationFee", {
                                  fee: money(plan.noCommitmentFeeCents!),
                                  withCommitment: commitment > 0 ? "yes" : "no",
                                })}
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
              </div>
            </fieldset>
            {/* Formule des packs payants : avec engagement (création offerte) ou sans (frais de création). */}
            {commitment > 0 && orderable.some((plan) => plan.priceCents > 0) && (
              <fieldset>
                <legend className={ui.label}>{t("formula")}</legend>
                <p className="mb-2 text-sm text-ink/70">{t("formulaHint")}</p>
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
                      text: t("withoutCommitmentPlanFee"),
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
              {t("paidHint")} {t("freeHint")}
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
