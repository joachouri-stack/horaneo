import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { Comparison } from "@/components/marketing/Comparison";
import { BillingToggle, SolutionScope } from "@/components/marketing/SolutionScope";
import { withPlatform } from "@/db/access";
import { resolveLocale } from "@/i18n/translator";
import { listPublicPlans } from "@/modules/billing/plans";
import { getPlatformSetting } from "@/modules/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/comparatif">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "home.comparison" });
  // Adresse de référence (relative : complétée par metadataBase du layout).
  return { title: t("title"), alternates: { canonical: `/${(await params).locale}/comparatif` } };
}

/**
 * Comparatif des packs : titre, choix Mensuel / Annuel et tableau des
 * fonctionnalités (même source que les cartes de l'accueil).
 */
export default async function ComparePage({ params }: PageProps<"/[locale]/comparatif">) {
  await connection();
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const [t, tPlans] = await Promise.all([getTranslations("home.comparison"), getTranslations("home.plans")]);
  const data = await withPlatform(async (tx) => ({
    plans: await listPublicPlans(tx),
    display: String(await getPlatformSetting(tx, "prices_display")),
    soon: await getPlatformSetting(tx, "features_soon"),
    yearly: {
      enabled: Boolean(await getPlatformSetting(tx, "yearly_billing_enabled")),
      freeMonths: Number(await getPlatformSetting(tx, "yearly_free_months")),
    },
  }));
  return (
    <div className="bg-white text-mk-body font-light text-[#3d4457]">
      <PlatformHeader />
      <main id="contenu" className="mx-auto max-w-[75rem] 2xl:max-w-[88rem] px-4 pb-20 pt-8 sm:px-6 lg:pt-12">
        <SolutionScope>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h1 className="font-display text-mk-h2 font-semibold tracking-[-0.025em] text-night">
              {t("title")}
            </h1>
            {/* Mensuel / Annuel, comme sur l'accueil : seulement si le paiement à l'année est proposé. */}
            {data.yearly.enabled && (
              <BillingToggle
                labels={{
                  group: tPlans("billingLabel"),
                  month: tPlans("billingMonth"),
                  year: tPlans("billingYear"),
                  badge:
                    data.yearly.freeMonths > 0
                      ? tPlans("billingBadge", { months: data.yearly.freeMonths })
                      : null,
                }}
              />
            )}
          </div>
          <Comparison
            plans={data.plans}
            locale={locale}
            soon={data.soon}
            display={data.display}
            yearly={data.yearly}
          />
        </SolutionScope>
      </main>
      <PlatformFooter />
    </div>
  );
}
