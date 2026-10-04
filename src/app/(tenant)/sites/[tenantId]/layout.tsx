import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getTenant } from "@/lib/tenancy/current-tenant";
import "../../../globals.css";

/**
 * Mise en page d'un site client. On n'arrive ici que par le proxy, qui a déjà
 * reconnu le domaine. Les couleurs et le modèle du client arrivent à l'étape 5 ;
 * la palette du SaaS n'est pas utilisée ici.
 */

export async function generateMetadata({ params }: LayoutProps<"/sites/[tenantId]">): Promise<Metadata> {
  const { tenantId } = await params;
  const tenant = await getTenant(tenantId);
  return { title: tenant?.name };
}

export default async function TenantLayout({ children, params }: LayoutProps<"/sites/[tenantId]">) {
  const { tenantId } = await params;
  const tenant = await getTenant(tenantId);
  if (!tenant) notFound();

  const locale = hasLocale(routing.locales, tenant.defaultLocale)
    ? tenant.defaultLocale
    : routing.defaultLocale;
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body className="min-h-dvh bg-white text-neutral-900">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
