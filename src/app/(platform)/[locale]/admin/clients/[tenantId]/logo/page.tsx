import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { AdminCustomColors, AdminLogoField } from "@/components/admin/AdminBrandFields";
import { WizardNav } from "@/components/admin/WizardNav";
import { CameraLine, FileLine, UsersLine } from "@/components/marketing/line-icons";
import { SiteBlockLink } from "@/components/manager/site-editor/SiteBlock";
import { SiteEditor } from "@/components/manager/site-editor/SiteEditor";
import { assets } from "@/db/schema";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { storage } from "@/lib/storage";
import {
  photoAction,
  savePageTextsAction,
  savePaletteAction,
  uploadHomeCoverAction,
  uploadLogoAction,
  uploadPhotoAction,
} from "../../actions";

/**
 * Fiche client (admin) : le site se modifie avec le même écran que « Mon site » de la gérante,
 * plus les couleurs au code près et les liens vers les réglages avancés.
 */
export default async function SiteEditorAdminPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/clients/[tenantId]/logo">) {
  const { locale, tenantId } = await params;
  const assistant = (await searchParams).assistant === "1";
  const [t, { tenant, plan }] = await Promise.all([
    getTranslations("admin.tenant.siteEditor"),
    loadTenantOverview(tenantId),
  ]);
  const logoId = tenant.brand.logoAssetId;
  const [logo] = logoId
    ? await adminQuery((tx) => tx.select().from(assets).where(eq(assets.id, logoId)))
    : [];
  const appearance = {
    businessCategory: tenant.businessCategory ?? "",
    templateKey: tenant.templateKey,
    theme: tenant.theme,
  };
  const base = `/admin/clients/${tenantId}`;
  const icon = "size-5";

  return (
    <>
      <WizardNav tenantId={tenantId} current="logo" active={assistant} />
      <SiteEditor
        tenantId={tenantId}
        tenant={tenant}
        features={plan.features as { testimonials?: boolean }}
        limits={plan.limits as { photos?: number | null }}
        locale={resolveLocale(locale)}
        db={(fn) => adminQuery(fn)}
        headingLevel={2}
        actions={{
          uploadLogo: uploadLogoAction,
          palette: savePaletteAction,
          cover: uploadHomeCoverAction,
          pageTexts: savePageTextsAction,
          photo: photoAction,
          uploadPhoto: uploadPhotoAction,
        }}
        links={{
          services: `${base}/prestations`,
          hours: `${base}/horaires`,
          testimonials: `${base}/temoignages`,
        }}
        logoSlot={
          <AdminLogoField
            tenantId={tenantId}
            logoUrl={logo ? storage().publicUrl(logo.storageKey) : null}
            appearance={appearance}
          />
        }
        brandExtra={
          <AdminCustomColors
            tenantId={tenantId}
            primary={tenant.brand.colors?.primary ?? "#1f1f1f"}
            secondary={tenant.brand.colors?.secondary ?? "#f5f1ea"}
            appearance={appearance}
          />
        }
        extraBlocks={
          <>
            <SiteBlockLink
              title={t("team")}
              summary={t("teamSummary")}
              icon={<UsersLine className={icon} />}
              href={`${base}/equipe`}
            />
            <SiteBlockLink
              title={t("photos")}
              summary={t("photosSummary")}
              icon={<CameraLine className={icon} />}
              href={`${base}/photos`}
            />
            <SiteBlockLink
              title={t("pages")}
              summary={t("pagesSummary")}
              icon={<FileLine className={icon} />}
              href={`${base}/pages`}
            />
          </>
        }
      />
    </>
  );
}
