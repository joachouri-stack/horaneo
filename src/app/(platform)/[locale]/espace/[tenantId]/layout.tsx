import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ScrollToTop } from "@/components/admin/ScrollToTop";
import { AppHeader } from "@/components/layout/AppHeader";
import { ManagerMain } from "@/components/manager/ManagerMain";
import { ManagerTabs } from "@/components/manager/ManagerTabs";
import { NotificationBell } from "@/components/manager/NotificationBell";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { env } from "@/config/env";
import { withTenant } from "@/db/access";
import { managedTenantIds, requireManager } from "@/lib/manager/access";
import { and, eq } from "drizzle-orm";
import { tenantDomains } from "@/db/schema";
import { tenantSiteUrl } from "@/lib/tenancy/urls";
import { getSubscription } from "@/modules/billing/subscriptions";
import { unseenNotificationCount } from "@/modules/notifications/feed";

/** Jamais référencé ; installable sur l'écran d'accueil (notifications sur iPhone). */
export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]/espace/[tenantId]">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const product = env().PRODUCT_NAME;
  return {
    robots: { index: false, follow: false },
    manifest: `/api/app/manifest?l=${locale}`,
    appleWebApp: { capable: true, title: product, statusBarStyle: "default" },
    icons: { apple: "/api/app/icon/180" },
  };
}

/** Espace gérante d'un établissement : en-tête, bandeau « voir comme le client », onglets. */
export default async function ManagerLayout({
  children,
  params,
}: LayoutProps<"/[locale]/espace/[tenantId]">) {
  const { locale: rawLocale, tenantId } = await params;
  const locale = resolveLocale(rawLocale);
  setRequestLocale(locale);
  const { tenant, business, businessId, multiBusiness, role, userId } = await requireManager(
    locale,
    tenantId,
  );
  const t = await getTranslations("manager");
  const several = role === "owner" && (await managedTenantIds(userId)).length > 1;
  const [subscription, unseen, [primary]] = await Promise.all([
    withTenant(tenantId, (tx) => getSubscription(tx, tenantId)),
    withTenant(tenantId, (tx) => unseenNotificationCount(tx, tenantId, { userId }), undefined, businessId),
    // Adresse du site, pour le lien « Voir mon site » de la barre latérale (site en ligne seulement).
    withTenant(tenantId, (tx) =>
      tx
        .select({ hostname: tenantDomains.hostname })
        .from(tenantDomains)
        .where(and(eq(tenantDomains.tenantId, tenantId), eq(tenantDomains.isPrimary, true))),
    ),
  ]);
  const siteUrl = primary && tenant.status === "active" ? tenantSiteUrl(primary.hostname) : null;

  return (
    <>
      {/* Sur téléphone, pas de bandeau du logo : plus de place, et « Se déconnecter » passe dans « Plus ». */}
      <div className="hidden lg:block">
        <AppHeader />
      </div>
      {role === "admin" && (
        // Toujours visible en haut de l'écran : le chemin du retour vers l'admin.
        <div role="status" className="sticky top-0 z-50 bg-navy px-4 py-1 text-center text-sm text-white">
          <ScrollToTop />
          {t("impersonating", {
            name: multiBusiness ? `${tenant.name} · ${business.name}` : tenant.name,
          })}{" "}
          {multiBusiness && (
            <>
              <Link
                href={`/admin/clients/${tenantId}/entreprises`}
                className="inline-flex min-h-11 items-center font-semibold underline"
              >
                {t("switchBusiness")}
              </Link>{" "}
              ·{" "}
            </>
          )}
          <Link
            href={`/admin/clients/${tenantId}`}
            className="inline-flex min-h-11 items-center font-semibold underline"
          >
            {t("backToAdmin")}
          </Link>
        </div>
      )}
      {subscription?.paymentFailedAt && (
        <div role="alert" className="bg-[#b4372a] px-4 py-2 text-center text-sm font-semibold text-white">
          {t("subscription.pastDueBanner")}{" "}
          <Link href={`/espace/${tenantId}/plus/abonnement`} className="underline">
            {t("subscription.portal")}
          </Link>
        </div>
      )}
      <div className="min-h-dvh bg-mist-50 lg:flex">
        <ManagerTabs tenantId={tenantId} siteUrl={siteUrl} siteLabel={t("viewSite")} />
        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate font-display text-lg font-semibold tracking-[-0.015em] text-night">
                {tenant.name}
                {multiBusiness && <span className="font-medium text-ink-soft"> · {business.name}</span>}
              </p>
              <div className="flex shrink-0 items-center gap-3">
                {several && (
                  <Link href="/espace" className="text-sm font-medium text-night underline">
                    {t("switchTenant")}
                  </Link>
                )}
                <NotificationBell
                  href={`/espace/${tenantId}/notifications`}
                  count={unseen}
                  label={
                    unseen > 0 ? t("notifications.bellUnseen", { count: unseen }) : t("notifications.title")
                  }
                />
              </div>
            </div>
          </div>
          <ManagerMain tenantId={tenantId}>{children}</ManagerMain>
        </div>
      </div>
    </>
  );
}
