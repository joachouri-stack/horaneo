import type { Metadata } from "next";
import { Cormorant_Garamond, Fraunces, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MobileBookBar } from "@/components/site/MobileBookBar";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { routing } from "@/i18n/routing";
import { getSite, isPreview } from "@/lib/site/load";
import { absoluteImageUrl, siteBaseUrl } from "@/lib/site/urls";
import { localBusinessJsonLd, serializeJsonLd } from "@/modules/site/seo";
import { buildTheme, themeCssVariables } from "@/modules/site/theme";
import "../../../globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});
const fraunces = Fraunces({ subsets: ["latin", "latin-ext"], variable: "--font-fraunces", display: "swap" });

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
  return {
    metadataBase: new URL(siteBaseUrl(site)),
    title: { default: home?.seoTitle || site.tenant.name, template: `%s · ${site.tenant.name}` },
    description: home?.seoDescription || home?.texts.tagline || undefined,
    robots: noindex ? { index: false, follow: false } : undefined,
    icons: logoUrl ? { icon: logoUrl } : undefined,
    openGraph: { siteName: site.tenant.name, type: "website", locale: site.locale },
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
  const theme = buildTheme(site.tenant.theme, site.tenant.colors);
  const style = {
    ...themeCssVariables(theme),
    "--site-font-display": theme.displayFont === "organic" ? "var(--font-fraunces)" : "var(--font-cormorant)",
  } as React.CSSProperties;
  const jsonLd = localBusinessJsonLd(
    site,
    siteBaseUrl(site),
    absoluteImageUrl(site, site.logo ?? site.pages.home?.photo ?? null),
  );

  return (
    <html lang={locale} className={`${inter.variable} ${cormorant.variable} ${fraunces.variable}`}>
      <body style={style} className="min-h-dvh bg-site-bg font-site-body text-site-text antialiased">
        <NextIntlClientProvider timeZone={site.tenant.timezone}>
          {preview && (
            <p role="status" className="bg-[#1b2a4a] px-4 py-2 text-center text-sm font-semibold text-white">
              {t("previewBanner")}
            </p>
          )}
          <SiteHeader site={site} showBook={site.tenant.status !== "suspended"} />
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
          <SiteFooter site={site} />
          {site.tenant.status !== "suspended" && <MobileBookBar phone={site.tenant.phone} />}
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
