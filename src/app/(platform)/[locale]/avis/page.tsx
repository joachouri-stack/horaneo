import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { ArrowLine, MailLine, StarLine } from "@/components/marketing/line-icons";
import { TestimonialCard } from "@/components/marketing/TestimonialCard";
import { env } from "@/config/env";
import { withPlatform } from "@/db/access";
import { resolveLocale } from "@/i18n/translator";
import { listShowcase } from "@/modules/showcase/showcase";
import { getPlatformSetting } from "@/modules/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/avis">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "home.reviews" });
  return { title: t("metaTitle"), alternates: { canonical: `/${(await params).locale}/avis` } };
}

/**
 * Avis clients : uniquement les témoignages réels saisis dans l'admin (avec l'accord des
 * personnes), et la page Trustpilot si elle est renseignée (avis indépendants). Aucune note ni
 * aucun nombre d'avis affiché sans source.
 */
export default async function ReviewsPage({ params }: PageProps<"/[locale]/avis">) {
  await connection();
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const [t, tShowcase] = await Promise.all([
    getTranslations("home.reviews"),
    getTranslations("home.showcase"),
  ]);
  const config = env();
  const product = config.PRODUCT_NAME;
  const contact = config.SUPPORT_EMAIL ?? `support@${config.MAIN_DOMAIN}`;
  const data = await withPlatform(async (tx) => ({
    showcase: await listShowcase(tx),
    trustpilot: String(await getPlatformSetting(tx, "trustpilot_url")),
  }));
  // Lien « écrire un avis » de Trustpilot : la page de la marque suivie de /evaluate… n'est pas
  // garantie ; on renvoie donc vers la page elle-même, où se trouve le bouton « Donner un avis ».
  const mail = `mailto:${contact}?subject=${encodeURIComponent(t("mailSubject", { product }))}`;

  return (
    <div className="bg-white text-mk-body font-light text-[#3d4457]">
      <PlatformHeader />
      <main
        id="contenu"
        className="mx-auto max-w-[75rem] px-4 pb-20 pt-10 sm:px-6 lg:pt-16 2xl:max-w-[88rem]"
      >
        <div className="flex flex-col items-center text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-coral/10 px-3 py-1 text-[0.875rem] font-medium uppercase tracking-[0.08em] text-coral-dark">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-coral" />
            {t("badge")}
          </p>
          <h1 className="hn-balance mt-4 font-display text-mk-h2 font-semibold leading-[1.1] tracking-[-0.025em] text-night">
            {t("title")} <span className="hn-grad-text">{t("titleAccent")}</span>
          </h1>
          <p className="mt-4 max-w-[36rem] text-mk-lead text-ink-soft">{t("intro", { product })}</p>
          {data.trustpilot && (
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <a
                href={data.trustpilot}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[linear-gradient(120deg,var(--color-violet),var(--color-azure-dark))] px-5 font-medium text-white shadow-[0_14px_30px_-14px_rgba(91,90,255,.8)] transition hover:-translate-y-px"
              >
                <StarLine className="size-[18px]" />
                {t("trustpilotRead")}
              </a>
              <a
                href={data.trustpilot}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-hairline bg-white px-5 font-medium text-night transition hover:border-violet/40 hover:text-violet"
              >
                {t("trustpilotWrite")}
                <ArrowLine className="size-4" />
              </a>
            </div>
          )}
          {data.trustpilot && (
            <p className="mt-3 max-w-[32rem] text-mk-small text-ink-soft">{t("trustpilotNote")}</p>
          )}
        </div>

        {data.showcase.length > 0 ? (
          <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-4">
            {data.showcase.map((entry) => (
              <li key={entry.id}>
                <TestimonialCard entry={entry} visitLabel={tShowcase("visit", { name: entry.name })} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mx-auto mt-12 max-w-[36rem] rounded-[1.4rem] border border-dashed border-violet/30 bg-[#f7f4ff] p-8 text-center lg:mt-16">
            <p className="font-display text-mk-card font-semibold text-night">{t("empty", { product })}</p>
          </div>
        )}

        {/* Clientes : laisser un témoignage (par e-mail), publié seulement avec leur accord. */}
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <p className="text-mk-body text-ink-soft">{t("emptyCta", { product })}</p>
          <a
            href={mail}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-hairline bg-white px-5 font-medium text-night transition hover:border-violet/40 hover:text-violet"
          >
            <MailLine className="size-[18px] text-violet" />
            {t("write")}
          </a>
        </div>
      </main>
      <PlatformFooter />
    </div>
  );
}
