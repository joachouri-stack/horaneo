import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CopyLink } from "@/components/manager/CopyLink";
import { ui } from "@/components/ui/styles";
import { env, publicAppUrl } from "@/config/env";
import { managerPage } from "@/lib/manager/page";
import { REFERRAL_COOKIE_DAYS, referralLink } from "@/modules/billing/referral-link";
import { referralOverview } from "@/modules/billing/referrals";

/** Parrainage : le lien à partager et les mois offerts gagnés. */
export default async function ReferralPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/parrainage">) {
  const page = await managerPage(params, "owner");
  const { locale } = await params;
  const t = await getTranslations("manager.referral");
  const data = await page.db((tx) => referralOverview(tx, page.tenantId));
  // Parrainage désactivé dans les réglages : la rubrique n'existe pas.
  if (data.rewardMonths === 0 || !data.code) notFound();
  const link = referralLink(publicAppUrl(), locale, data.code);
  const product = env().PRODUCT_NAME;
  const share = t("shareMessage", { link, product });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
          {t("title")}
        </h1>
        <p className="mt-1 text-ink-soft">{t("subtitle", { months: data.rewardMonths, product })}</p>
      </div>

      <section className={`${ui.card} space-y-4`} aria-labelledby="parrainage-lien">
        <h2 id="parrainage-lien" className="text-lg font-semibold text-night">
          {t("linkTitle")}
        </h2>
        {data.active ? (
          <>
            <CopyLink
              id="referral-link"
              value={link}
              label={t("linkLabel")}
              copyLabel={t("copy")}
              copiedLabel={t("copied")}
            />
            <a
              href={`https://wa.me/?text=${encodeURIComponent(share)}`}
              target="_blank"
              rel="noreferrer"
              className={ui.secondaryButton}
            >
              {t("whatsapp")}
            </a>
          </>
        ) : (
          <p className="text-ink-soft">{t("notLive")}</p>
        )}
      </section>

      <section className={ui.card} aria-labelledby="parrainage-suivi">
        <h2 id="parrainage-suivi" className="text-lg font-semibold text-night">
          {t("statsTitle")}
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-ink-soft">{t("pending")}</dt>
            <dd className="font-display text-2xl font-semibold text-night">{data.pending}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-soft">{t("earned")}</dt>
            <dd className="font-display text-2xl font-semibold text-night">
              {t("monthsValue", { months: data.monthsEarned })}
            </dd>
          </div>
        </dl>
      </section>

      <section className={ui.card} aria-labelledby="parrainage-regles">
        <h2 id="parrainage-regles" className="text-lg font-semibold text-night">
          {t("howTitle")}
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-soft">
          <li>{t("how1")}</li>
          <li>{t("how2", { days: REFERRAL_COOKIE_DAYS })}</li>
          <li>{t("how3", { months: data.rewardMonths })}</li>
        </ol>
      </section>
    </div>
  );
}
