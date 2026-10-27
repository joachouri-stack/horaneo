import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { Comparison } from "@/components/marketing/Comparison";
import { ArrowLine } from "@/components/marketing/line-icons";
import { SolutionScope, SolutionTabs } from "@/components/marketing/SolutionScope";
import { withPlatform } from "@/db/access";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { SOLUTIONS } from "@/modules/billing/grid";
import { listPublicPlans } from "@/modules/billing/plans";
import { getPlatformSetting } from "@/modules/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/comparatif">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "home.comparison" });
  return { title: t("title") };
}

/** Comparatif détaillé des packs, par solution (même tableau que l'accueil). */
export default async function ComparePage({ params }: PageProps<"/[locale]/comparatif">) {
  await connection();
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const [t, tHome] = await Promise.all([getTranslations("home.comparison"), getTranslations("home")]);
  const data = await withPlatform(async (tx) => ({
    plans: await listPublicPlans(tx),
    display: String(await getPlatformSetting(tx, "prices_display")),
    soon: await getPlatformSetting(tx, "features_soon"),
    solutions: await getPlatformSetting(tx, "solutions"),
  }));
  return (
    <div className="bg-white text-mk-body font-light text-[#3d4457]">
      <PlatformHeader />
      <main id="contenu" className="mx-auto max-w-[75rem] px-4 pb-20 pt-8 sm:px-6 lg:pt-12">
        <Link
          href={{ pathname: "/", hash: "tarifs" }}
          className="inline-flex min-h-11 items-center gap-1.5 font-medium text-navy underline underline-offset-4"
        >
          <ArrowLine className="size-4 rotate-180" />
          {tHome("plans.title")}
        </Link>
        <SolutionScope>
          <h1 className="mb-6 mt-4 font-display text-mk-h2 font-semibold tracking-[-0.025em] text-night">
            {t("title")}
          </h1>
          <div className="mb-8">
            <SolutionTabs
              label={tHome("solutions.label")}
              soonLabel={tHome("solutions.soon")}
              items={SOLUTIONS.map((code) => ({
                code,
                name: tHome(`solutions.items.${code}.name`),
                short: tHome(`solutions.items.${code}.short`),
                soon: data.solutions.find((item) => item.code === code)?.status !== "available",
              }))}
            />
          </div>
          <Comparison plans={data.plans} locale={locale} soon={data.soon} display={data.display} />
        </SolutionScope>
      </main>
      <PlatformFooter />
    </div>
  );
}
