import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { Comparison } from "@/components/marketing/Comparison";
import { SolutionScope } from "@/components/marketing/SolutionScope";
import { withPlatform } from "@/db/access";
import { resolveLocale } from "@/i18n/translator";
import { listPublicPlans } from "@/modules/billing/plans";
import { getPlatformSetting } from "@/modules/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/comparatif">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "home.comparison" });
  return { title: t("title") };
}

/**
 * Page « Fonctionnalités » du menu : seulement le titre et le tableau des
 * fonctionnalités des packs (même tableau que l'accueil), rien d'autre.
 */
export default async function ComparePage({ params }: PageProps<"/[locale]/comparatif">) {
  await connection();
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("home.comparison");
  const data = await withPlatform(async (tx) => ({
    plans: await listPublicPlans(tx),
    display: String(await getPlatformSetting(tx, "prices_display")),
    soon: await getPlatformSetting(tx, "features_soon"),
  }));
  return (
    <div className="bg-white text-mk-body font-light text-[#3d4457]">
      <PlatformHeader />
      <main id="contenu" className="mx-auto max-w-[75rem] 2xl:max-w-[88rem] px-4 pb-20 pt-8 sm:px-6 lg:pt-12">
        <SolutionScope>
          <h1 className="mb-6 font-display text-mk-h2 font-semibold tracking-[-0.025em] text-night">
            {t("title")}
          </h1>
          <Comparison plans={data.plans} locale={locale} soon={data.soon} display={data.display} />
        </SolutionScope>
      </main>
      <PlatformFooter />
    </div>
  );
}
