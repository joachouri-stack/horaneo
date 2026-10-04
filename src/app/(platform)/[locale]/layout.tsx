import type { Metadata } from "next";
import { Inter, Nunito } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { env } from "@/config/env";
import { routing } from "@/i18n/routing";
import "../../globals.css";

const nunito = Nunito({
  subsets: ["latin", "cyrillic"],
  variable: "--font-nunito",
  weight: ["700", "800", "900"],
});
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  const product = env().PRODUCT_NAME;
  return {
    title: t("title", { product }),
    description: t("description"),
  };
}

export default async function PlatformLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${nunito.variable} ${inter.variable} antialiased`}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
