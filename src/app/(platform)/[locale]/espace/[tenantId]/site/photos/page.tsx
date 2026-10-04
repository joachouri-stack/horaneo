import { PhotosEditor } from "@/components/editors/PhotosEditor";
import { PhotoCropUpload } from "@/components/manager/PhotoCropUpload";
import { withTenant } from "@/db/access";
import { managerPage } from "@/lib/manager/page";
import { listActiveAssets, listRetiredAssets } from "@/modules/media/assets";
import { photoAction, uploadPhotoAction } from "../../actions";

/** Photos : ajout avec recadrage, retrait, restauration pendant quelques jours. */
export default async function ManagerPhotosPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/site/photos">) {
  const page = await managerPage(params);
  const { active, retired } = await withTenant(page.tenantId, async (tx) => ({
    active: await listActiveAssets(tx, page.tenantId),
    retired: await listRetiredAssets(tx, page.tenantId),
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
        uploader={<PhotoCropUpload tenantId={page.tenantId} action={uploadPhotoAction} />}
      />
    </div>
  );
}
