import { PhotosEditor } from "@/components/editors/PhotosEditor";
import { SharedContentNotice } from "@/components/manager/SharedContentNotice";
import { PhotoCropUpload } from "@/components/manager/PhotoCropUpload";
import { managerPage } from "@/lib/manager/page";
import { listActiveAssets, listRetiredAssets } from "@/modules/media/assets";
import { photoAction, uploadPhotoAction } from "../../actions";

/** Photos : ajout avec recadrage, retrait, restauration pendant quelques jours. */
export default async function ManagerPhotosPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/site/photos">) {
  const page = await managerPage(params);
  // Photos communes au site : modifiées depuis l'entreprise principale seulement.
  if (!page.business.isPrimary) return <SharedContentNotice />;
  const { active, retired } = await page.db(async (tx) => ({
    active: await listActiveAssets(tx, page.tenantId, { photosOnly: true }),
    retired: await listRetiredAssets(tx, page.tenantId, { photosOnly: true }),
  }));
  return (
    <div className="space-y-6">
      <PhotosEditor
        tenantId={page.tenantId}
        locale={page.locale}
        contentLocale={page.tenant.defaultLocale}
        limit={page.tenant.limits.photos}
        active={active}
        retired={retired}
        photoAction={photoAction}
        headingLevel={1}
        uploader={<PhotoCropUpload tenantId={page.tenantId} action={uploadPhotoAction} />}
      />
    </div>
  );
}
