import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppHeader } from "@/components/layout/AppHeader";
import { ManagerTabs } from "@/components/manager/ManagerTabs";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { withTenant } from "@/db/access";
import { managedTenantIds, requireManager } from "@/lib/manager/access";
import { getSubscription } from "@/modules/billing/subscriptions";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Espace gérante d'un établissement : en-tête, bandeau « voir comme le client », onglets. */
export default async function ManagerLayout({
  children,
  params,
}: LayoutProps<"/[locale]/espace/[tenantId]">) {
  const { locale: rawLocale, tenantId } = await params;
  const locale = resolveLocale(rawLocale);
  setRequestLocale(locale);
  const { tenant, role, userId } = await requireManager(locale, tenantId);
  const t = await getTranslations("manager");
  const several = role === "owner" && (await managedTenantIds(userId)).length > 1;
  const subscription = await withTenant(tenantId, (tx) => getSubscription(tx, tenantId));

  return (
    <>
      <AppHeader />
      {role === "admin" && (
        <div role="status" className="bg-navy px-4 py-2 text-center text-sm text-white">
          {t("impersonating", { name: tenant.name })}{" "}
          <Link href={`/admin/clients/${tenantId}`} className="font-semibold underline">
            {t("backToAdmin")}
          </Link>
        </div>
      )}
      {subscription?.paymentFailedAt && (
        <div role="alert" className="bg-coral-dark px-4 py-2 text-center text-sm font-semibold text-white">
          {t("subscription.pastDueBanner")}{" "}
          <Link href={`/espace/${tenantId}/plus/abonnement`} className="underline">
            {t("subscription.portal")}
          </Link>
        </div>
      )}
      <div className="mx-auto max-w-3xl px-4 pt-2">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate font-display text-lg font-extrabold text-navy">{tenant.name}</p>
          {several && (
            <Link href="/espace" className="shrink-0 text-sm font-semibold text-navy underline">
              {t("switchTenant")}
            </Link>
          )}
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4">
        <ManagerTabs tenantId={tenantId} />
      </div>
      <main id="contenu" className="mx-auto max-w-3xl px-4 pb-28 pt-4 md:pb-12">
        {children}
      </main>
    </>
  );
}
