import { getTranslations } from "next-intl/server";
import { SitePreview } from "@/components/admin/SitePreview";
import { WizardNav } from "@/components/admin/WizardNav";
import { ui } from "@/components/ui/styles";
import { authSecret } from "@/config/env";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { createPreviewToken, PREVIEW_PARAM } from "@/lib/tenancy/preview";
import { tenantSiteUrl } from "@/lib/tenancy/urls";

/** Aperçu du site avant sa mise en ligne (étape de l'assistant et onglet de la fiche). */
export default async function PreviewPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/clients/[tenantId]/apercu">) {
  const { tenantId } = await params;
  const assistant = (await searchParams).assistant === "1";
  const [t, overview] = await Promise.all([
    getTranslations("admin.tenant.previewPage"),
    loadTenantOverview(tenantId),
  ]);
  const draft = overview.tenant.status === "draft";
  const primary = overview.domains.find((domain) => domain.isPrimary);
  // Site en création : l'adresse en sous-domaine, du même site que l'admin, pour que
  // l'aperçu reste ouvert en naviguant dans le cadre.
  const host = draft ? (overview.domains.find((domain) => domain.type === "subdomain") ?? primary) : primary;
  const src = host
    ? draft
      ? `${tenantSiteUrl(host.hostname)}/?${PREVIEW_PARAM}=${createPreviewToken(tenantId, authSecret())}`
      : tenantSiteUrl(host.hostname)
    : null;
  return (
    <>
      <WizardNav tenantId={tenantId} current="apercu" active={assistant} />
      <div>
        <h2 className="text-2xl font-extrabold">{t("title")}</h2>
        <p className="mt-1 text-ink/80">{draft ? t("introDraft") : t("introLive")}</p>
      </div>
      {src ? (
        <SitePreview
          src={src}
          title={t("frameTitle", { name: overview.tenant.name })}
          labels={{ phone: t("phone"), desktop: t("desktop"), open: t("open"), device: t("device") }}
        />
      ) : (
        <p className={ui.card}>{t("noDomain")}</p>
      )}
    </>
  );
}
