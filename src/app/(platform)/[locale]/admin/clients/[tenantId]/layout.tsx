import { getTranslations, setRequestLocale } from "next-intl/server";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { TenantTabs } from "@/components/admin/TenantTabs";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { requireAdmin } from "@/lib/auth/session";
import { tenantSiteUrl } from "@/lib/tenancy/urls";

/** En-tête commun aux écrans d'un client : nom, statut, lien vers le site, onglets. */
export default async function TenantAdminLayout({
  children,
  params,
}: LayoutProps<"/[locale]/admin/clients/[tenantId]">) {
  const { locale: rawLocale, tenantId } = await params;
  const locale = resolveLocale(rawLocale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, overview] = await Promise.all([getTranslations("admin.tenant"), loadTenantOverview(tenantId)]);
  const primary = overview.domains.find((domain) => domain.isPrimary);

  return (
    <main id="contenu" className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <Link href="/admin/clients" className="text-sm font-semibold text-navy underline">
        ← {t("backToList")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold">{overview.tenant.name}</h1>
          <StatusBadge status={overview.tenant.status} />
        </div>
        {primary && (
          <a
            href={tenantSiteUrl(primary.hostname)}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-navy underline"
          >
            {t("viewSite")} ↗
          </a>
        )}
      </div>
      <TenantTabs tenantId={tenantId} />
      <div className="space-y-6 pt-2">{children}</div>
    </main>
  );
}
