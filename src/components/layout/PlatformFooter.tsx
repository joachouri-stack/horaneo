import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/Logo";
import { NAV } from "@/components/layout/PlatformHeader";
import { ArrowLine, MailLine } from "@/components/marketing/line-icons";
import { SocialCards, socialHandle, type SocialNetwork } from "@/components/marketing/SocialCards";
import { env } from "@/config/env";
import { withPlatform } from "@/db/access";
import { Link } from "@/i18n/navigation";
import { getPlatformSetting } from "@/modules/settings";

const NETWORKS: SocialNetwork[] = ["youtube", "tiktok", "instagram", "facebook"];

const LINK =
  "inline-flex min-h-11 items-center text-[#c8d0e4] transition-colors hover:text-white focus-visible:outline-white";
const HEADING = "mb-2 text-mk-note font-medium uppercase tracking-[0.16em] text-champagne";

/**
 * Pied de page du site commercial, en bleu nuit profond (même univers que la carte
 * du pack mis en avant) : logo clair, phrase d'accroche et contact ; accès à
 * l'espace pro ; sections de l'accueil, espace pro, documents légaux ; droits.
 */
export async function PlatformFooter() {
  const [t, tNav, tCommon] = await Promise.all([
    getTranslations("home.footer"),
    getTranslations("home.nav"),
    getTranslations("common"),
  ]);
  const config = env();
  const product = config.PRODUCT_NAME;
  const contact = config.SUPPORT_EMAIL ?? `support@${config.MAIN_DOMAIN}`;
  const legal = [
    { href: "/mentions-legales", label: t("legal") },
    { href: "/confidentialite", label: t("privacy") },
    { href: "/conditions", label: t("terms") },
  ] as const;
  // Les quatre réseaux sont toujours affichés ; ceux dont l'adresse n'est pas encore
  // renseignée (Admin → Réglages → Réseaux sociaux) portent « Bientôt » et ne s'ouvrent pas.
  const urls = await withPlatform(async (tx) =>
    Promise.all(NETWORKS.map(async (network) => String(await getPlatformSetting(tx, `social_${network}`)))),
  );
  const socials = NETWORKS.map((network, index) => {
    const url = urls[index] || null;
    const name = t(`networks.${network}`);
    const handle = url ? socialHandle(url) : t("socialSoon");
    return { network, url, name, handle, label: url ? t("socialLink", { network: name, handle }) : name };
  });
  return (
    <footer className="relative overflow-hidden bg-[#0e1526] text-[#c8d0e4]">
      {/* Filet champagne en haut, halos flous qui dérivent doucement. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,#d9c08e_30%,#e4cfa2_50%,#d9c08e_70%,transparent)] opacity-70"
      />
      <div
        aria-hidden="true"
        className="hn-drift pointer-events-none absolute -left-24 -top-32 size-96 rounded-full bg-[#3a4bb8]/25 blur-[100px]"
      />
      <div
        aria-hidden="true"
        className="hn-drift-slow pointer-events-none absolute -bottom-40 -right-16 size-96 rounded-full bg-champagne/15 blur-[100px]"
      />

      <div className="relative mx-auto max-w-[75rem] 2xl:max-w-[88rem] px-4 pb-0 pt-16 sm:px-6 lg:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
          <div>
            <Link
              href="/"
              aria-label={tCommon("homeLink", { product })}
              className="inline-flex min-h-11 items-center focus-visible:outline-white"
            >
              <Logo productName={product} light className="text-[2rem]" />
            </Link>
            <p className="mt-4 max-w-[26rem] text-[1.0625rem] leading-relaxed text-[#aab4cc]">
              {t("tagline")}
            </p>
            <a
              href={`mailto:${contact}`}
              className="mt-6 inline-flex min-h-11 items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.04] px-5 text-[0.9375rem] text-white transition hover:border-champagne/60 hover:bg-white/[0.07] focus-visible:outline-white"
            >
              <MailLine className="size-[18px] text-champagne" />
              {contact}
            </a>
          </div>

          {/* Déjà client : accès direct à l'espace pro. */}
          <div className="self-start rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm lg:p-7">
            <p className="font-display text-mk-card font-semibold tracking-[-0.02em] text-white">
              {t("proCardTitle")}
            </p>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#aab4cc]">{t("proCardText")}</p>
            <Link
              href="/connexion"
              className="hn-shine group mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#d9c08e,#e4cfa2)] px-5 text-mk-body font-medium text-[#121a2c] transition hover:-translate-y-px focus-visible:outline-white"
            >
              {tCommon("login")}
              <ArrowLine className="size-[18px] transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {socials.length > 0 && (
          <section aria-labelledby="pied-reseaux" className="mt-14">
            <p id="pied-reseaux" className={HEADING}>
              {t("socialTitle")}
            </p>
            <div className="mt-3">
              <SocialCards cards={socials} />
            </div>
          </section>
        )}

        <div className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 border-t border-white/10 pt-10 sm:grid-cols-3">
          <nav aria-labelledby="pied-decouvrir">
            <p id="pied-decouvrir" className={HEADING}>
              {t("discover")}
            </p>
            <ul className="text-mk-small">
              {NAV.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className={LINK}>
                    {tNav(item.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-labelledby="pied-pro">
            <p id="pied-pro" className={HEADING}>
              {t("pro")}
            </p>
            <ul className="text-mk-small">
              <li>
                <Link href="/connexion" className={LINK}>
                  {tCommon("login")}
                </Link>
              </li>
              <li>
                <a href={`mailto:${contact}`} className={LINK}>
                  {t("contact")}
                </a>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="pied-legal">
            <p id="pied-legal" className={HEADING}>
              {t("legalTitle")}
            </p>
            <ul className="text-mk-small">
              {legal.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={LINK}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-[0.9375rem] text-[#8b95ad]">
          <p>{t("rights", { year: new Date().getFullYear(), product: product.toLocaleUpperCase() })}</p>
        </div>

        {/* La marque en très grand, qui s'estompe vers le bas : signature du pied de page. */}
        <div
          aria-hidden="true"
          className="pointer-events-none mt-8 flex select-none justify-center [mask-image:linear-gradient(to_bottom,#000_35%,transparent_95%)] lg:mt-10"
        >
          <Logo productName={product} light className="text-[clamp(3rem,14.5vw,11.5rem)] leading-[0.9]" />
        </div>
      </div>
    </footer>
  );
}
