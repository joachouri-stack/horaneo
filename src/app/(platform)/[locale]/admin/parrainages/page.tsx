import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { AdminSubNav } from "@/components/admin/AdminSubNav";
import { Hidden } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { requireAdmin } from "@/lib/auth/session";
import { formatDate, formatMoney } from "@/lib/format";
import { listReferrals, referralRewardMonths } from "@/modules/billing/referrals";
import { markReferralGrantedAction } from "./actions";

/** Parrainages : qui a recommandé qui, et les mois offerts (crédités ou à accorder à la main). */
export default async function ReferralsPage({ params }: PageProps<"/[locale]/admin/parrainages">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const t = await getTranslations("admin.referrals");
  const { rows, months } = await adminQuery(async (tx) => ({
    rows: await listReferrals(tx),
    months: await referralRewardMonths(tx),
  }));
  return (
    <main id="contenu" className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-extrabold">{t("title")}</h1>
      <AdminSubNav group="plans" current="/admin/parrainages" />
      <p className="text-ink/80">{months > 0 ? t("intro", { months }) : t("disabled")}</p>
      <section className={ui.card} aria-labelledby="liste-parrainages">
        <h2 id="liste-parrainages" className="sr-only">
          {t("title")}
        </h2>
        {rows.length === 0 ? (
          <p className="text-ink/70">{t("none")}</p>
        ) : (
          <ul className="divide-y divide-navy/10">
            {rows.map(({ referral, sponsorName, businessName, currency }) => (
              <li key={referral.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="font-semibold text-night">
                    {t("pair", { sponsor: sponsorName, referred: businessName })}
                  </span>
                  <span className="block text-ink/70">
                    {t(`statuses.${referral.status}`)} · {formatDate(referral.createdAt, locale)} ·{" "}
                    {t("months", { months: referral.rewardMonths })}
                    {referral.creditCents !== null &&
                      ` · ${t("credited", { amount: formatMoney(referral.creditCents, currency, locale) })}`}
                  </span>
                </span>
                {referral.status === "manual" && (
                  <ActionForm
                    action={markReferralGrantedAction}
                    submitLabel={t("grant")}
                    variant="secondary"
                    confirm={t("confirmGrant", { name: sponsorName })}
                    successMessage={t("granted")}
                  >
                    <Hidden values={{ referralId: referral.id }} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
