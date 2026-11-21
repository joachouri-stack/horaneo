import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { ArrowLine } from "@/components/marketing/line-icons";
import { TRADE_PAGES } from "@/config/trades";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { capitalize } from "@/lib/text";

export async function generateMetadata({ params }: PageProps<"/[locale]/metiers">): Promise<Metadata> {
  const rawLocale = (await params).locale;
  const t = await getTranslations({ locale: resolveLocale(rawLocale), namespace: "trades" });
  return {
    title: t("indexTitle"),
    description: t("indexMetaDescription"),
    alternates: { canonical: `/${rawLocale}/metiers` },
  };
}

/** Liste des pages par métier (liens du pied de page et du plan du site). */
export default async function TradesIndexPage({ params }: PageProps<"/[locale]/metiers">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("trades");
  return (
    <div className="bg-white text-mk-body font-light text-[#3d4457]">
      <PlatformHeader />
      <main id="contenu" className="mx-auto max-w-[60rem] px-4 pb-20 pt-10 sm:px-6 lg:pt-16">
        <h1 className="font-display text-mk-h2 font-semibold leading-[1.1] tracking-[-0.025em] text-night">
          {t("indexTitle")}
        </h1>
        <p className="mt-3 max-w-[40rem] text-ink-soft">{t("indexIntro")}</p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {TRADE_PAGES.map((trade) => (
            <li key={trade.slug}>
              <Link
                href={`/metiers/${trade.slug}`}
                className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-hairline bg-white px-5 py-4 transition hover:border-accent-line"
              >
                <span>
                  <span className="block font-display text-mk-card font-semibold text-night">
                    {capitalize(t(`items.${trade.key}.name`), locale)}
                  </span>
                  <span className="mt-1 block text-mk-small text-ink-soft">
                    {t(`items.${trade.key}.accent`)}
                  </span>
                </span>
                <ArrowLine className="size-5 flex-none text-accent" />
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <PlatformFooter />
    </div>
  );
}
