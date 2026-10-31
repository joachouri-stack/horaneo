import type { Metadata } from "next";
import { InstallCapture } from "@/components/install/InstallCapture";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { env, publicAppUrl } from "@/config/env";
import { routing } from "@/i18n/routing";
import { resolveLocale } from "@/i18n/translator";
// Polices fournies avec le projet : la construction ne dépend pas du réseau.
import "@fontsource-variable/bricolage-grotesque/wght.css";
import "@fontsource-variable/outfit/wght.css";
import "@fontsource/comfortaa/latin-700.css";
import "@fontsource/comfortaa/cyrillic-700.css";
import "../../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "metadata" });
  const product = env().PRODUCT_NAME;
  return {
    metadataBase: new URL(publicAppUrl()),
    // Pages secondaires : « Mentions légales · Horaneo » (le nom du produit est ajouté).
    title: { default: t("title", { product }), template: `%s · ${product}` },
    description: t("description"),
  };
}

export default async function PlatformLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className="antialiased">
      <body className="saas min-h-dvh">
        <InstallCapture />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
