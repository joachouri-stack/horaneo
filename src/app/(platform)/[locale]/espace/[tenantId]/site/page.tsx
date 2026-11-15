import { SiteEditor } from "@/components/manager/site-editor/SiteEditor";
import { managerPage } from "@/lib/manager/page";
import {
  photoAction,
  savePageTextsAction,
  savePaletteAction,
  uploadHomeCoverAction,
  uploadLogoAction,
  uploadPhotoAction,
} from "../actions";

/** « Mon site » : la gérante modifie son site bloc par bloc, avec l'aperçu à côté. */
export default async function MySitePage({ params }: PageProps<"/[locale]/espace/[tenantId]/site">) {
  const page = await managerPage(params, "site");
  return (
    <SiteEditor
      tenantId={page.tenantId}
      tenant={page.tenant}
      features={page.tenant.features}
      limits={page.tenant.limits}
      locale={page.locale}
      db={page.db}
      actions={{
        uploadLogo: uploadLogoAction,
        palette: savePaletteAction,
        cover: uploadHomeCoverAction,
        pageTexts: savePageTextsAction,
        photo: photoAction,
        uploadPhoto: uploadPhotoAction,
      }}
      links={{
        services: `${page.base}/site/prestations`,
        hours: `${page.base}/site/horaires`,
        testimonials: `${page.base}/site/temoignages`,
        request: `${page.base}/plus/demandes`,
      }}
      // Établissement secondaire : le contenu du site se gère depuis l'établissement principal.
      sharedContent={!page.business.isPrimary}
    />
  );
}
