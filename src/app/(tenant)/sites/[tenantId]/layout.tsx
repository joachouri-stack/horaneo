import type { Metadata } from "next";
import { InstallCapture } from "@/components/install/InstallCapture";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { AtelierFooter } from "@/components/site/atelier/AtelierFooter";
import { AtelierHeader } from "@/components/site/atelier/AtelierHeader";
import { HideOnPaths } from "@/components/site/HideOnPaths";
import { InstallAppBanner } from "@/components/site/InstallAppBanner";
import { MobileBookBar } from "@/components/site/MobileBookBar";
import { OfferBanner } from "@/components/site/OfferBanner";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { routing } from "@/i18n/routing";
import { getSite, isPreview } from "@/lib/site/load";
import { absoluteImageUrl, shareImage, siteBaseUrl } from "@/lib/site/urls";
import { siteCta } from "@/modules/site/cta";
import { APP_PATHS, businessPath, SITE_PATHS } from "@/modules/site/paths";
import { homeDescription, localBusinessJsonLd, serializeJsonLd } from "@/modules/site/seo";
import { buildTheme, themeCssVariables } from "@/modules/site/theme";
// Polices fournies avec le projet : la construction ne dépend pas du réseau.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/cormorant-garamond/wght.css";
import "@fontsource-variable/fraunces/wght.css";
import "@fontsource-variable/jost/wght.css";
import "../../../globals.css";

/**
 * Mise en page du site d'un client (modèle bien-être). On n'arrive ici que par
 * le proxy, qui a reconnu le domaine. Couleurs et ambiance du client ; la
 * palette du SaaS n'est jamais utilisée.
 */

export async function generateMetadata({ params }: LayoutProps<"/sites/[tenantId]">): Promise<Metadata> {
  const { tenantId } = await params;
  const site = await getSite(tenantId);
  const home = site.pages.home;
  const preview = await isPreview();
  const noindex = preview || site.tenant.status !== "active";
  const logoUrl = absoluteImageUrl(site, site.logo);
  const share = absoluteImageUrl(site, shareImage(site));
  return {
    metadataBase: new URL(siteBaseUrl(site)),
    title: {
      default: home?.seoTitle || [home?.texts.badge, site.tenant.name].filter(Boolean).join(" · "),
      template: `%s · ${site.tenant.name}`,
    },
    description: homeDescription(home),
    robots: noindex ? { index: false, follow: false } : undefined,
    icons: { ...(logoUrl ? { icon: logoUrl } : {}), apple: APP_PATHS.icon(180) },
    // Installable sur l'écran d'accueil de la cliente, comme une application.
    manifest: APP_PATHS.manifest,
    appleWebApp: { capable: true, title: site.tenant.name, statusBarStyle: "default" },
    openGraph: {
      siteName: site.tenant.name,
      type: "website",
      locale: site.locale,
      ...(share ? { images: [{ url: share }] } : {}),
    },
    twitter: { card: share ? "summary_large_image" : "summary" },
  };
}

export default async function TenantLayout({ children, params }: LayoutProps<"/sites/[tenantId]">) {
  const { tenantId } = await params;
  const site = await getSite(tenantId);
  const preview = await isPreview();
  // Double sécurité : un site en création n'est montré qu'en aperçu.
  if (site.tenant.status === "draft" && !preview) notFound();

  const locale = hasLocale(routing.locales, site.locale) ? site.locale : routing.defaultLocale;
  setRequestLocale(locale);
  const t = await getTranslations("site");
  // Seuls les textes utiles au navigateur sur un site client (pas ceux de l'admin).
  const allMessages = await getMessages();
  const clientMessages = Object.fromEntries(
    (["site", "booking", "errors", "weekdays"] as const).map((key) => [key, allMessages[key]]),
  );
  const theme = buildTheme(site.tenant.theme, site.tenant.colors);
  const atelier = site.tenant.templateKey === "atelier" && site.features.fullSite;
  const style = {
    ...themeCssVariables(theme),
    "--site-font-display": theme.displayFont === "organic" ? "var(--font-fraunces)" : "var(--font-cormorant)",
    "--site-font-body": atelier ? "var(--font-jost)" : "var(--font-inter)",
    // Atelier : titres bruns et blocs blancs ; sinon titres à la couleur principale et blocs teintés.
    "--site-heading": atelier ? "var(--site-text)" : "var(--site-accent)",
    "--site-panel": atelier ? "var(--site-card)" : "var(--site-surface)",
  } as React.CSSProperties;
  const Header = atelier ? AtelierHeader : SiteHeader;
  const Footer = atelier ? AtelierFooter : SiteFooter;
  const jsonLd = localBusinessJsonLd(
    site,
    siteBaseUrl(site),
    absoluteImageUrl(site, site.logo ?? site.pages.home?.photo ?? null),
  );

  return (
    <html lang={locale}>
      <body style={style} className="min-h-dvh bg-site-bg font-site-body text-site-text antialiased">
        <InstallCapture />
        <NextIntlClientProvider timeZone={site.tenant.timezone} messages={clientMessages}>
          {preview && (
            <p role="status" className="bg-[#1b2a4a] px-4 py-2 text-center text-sm font-semibold text-white">
              {t("previewBanner")}
            </p>
          )}
          {site.tenant.status !== "suspended" && <OfferBanner site={site} />}
          <Header site={site} showBook={site.tenant.status !== "suspended"} />
          {site.tenant.status === "suspended" ? (
            <main id="contenu" className="mx-auto max-w-2xl px-4 py-24 text-center">
              <h1 className="font-site-display text-4xl font-semibold text-site-accent">
                {site.tenant.name}
              </h1>
              <p className="mt-4">{t("suspended")}</p>
            </main>
          ) : (
            children
          )}
          <Footer site={site} />
          {site.tenant.status !== "suspended" && (
            <MobileBookBar
              phone={site.tenant.contactBar?.phone ?? site.tenant.phone}
              mode={site.tenant.contactBar?.mode ?? "call"}
              cta={siteCta(site)}
              pages={
                site.businesses.length > 1
                  ? site.businesses
                      .filter((business) => business.slug)
                      .map((business) => ({
                        path: businessPath(business.slug!),
                        phone: business.phone ?? site.tenant.contactBar?.phone ?? site.tenant.phone,
                        cta: siteCta(site, { businessId: business.id }),
                      }))
                  : []
              }
            />
          )}
          {site.tenant.status === "active" && (
            // Pas pendant une réservation ou un paiement : la cliente reste concentrée.
            <HideOnPaths prefixes={[SITE_PATHS.booking, SITE_PATHS.appointment, SITE_PATHS.giftCard]}>
              <InstallAppBanner
                iconUrl={APP_PATHS.icon(192)}
                labels={{
                  title: t("install.title", { name: site.tenant.name }),
                  text: t("install.text"),
                  install: t("install.install"),
                  later: t("install.later"),
                  iosHowTo: t("install.iosHowTo"),
                  close: t("install.close"),
                }}
              />
            </HideOnPaths>
          )}
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
