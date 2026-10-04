import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, SelectField, TextField } from "@/components/admin/fields";
import { PhotosEditor } from "@/components/editors/PhotosEditor";
import { PhotoCropUpload } from "@/components/manager/PhotoCropUpload";
import { ui } from "@/components/ui/styles";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { listActiveAssets, listRetiredAssets } from "@/modules/media/assets";
import { photoAction, uploadPhotoAction } from "../../actions";

/** Photos d'un client : l'administratrice peut en ajouter elle-même. */
export default async function PhotosPage({ params }: PageProps<"/[locale]/admin/clients/[tenantId]/photos">) {
  const { tenantId, locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const [t, overview, { active, retired }] = await Promise.all([
    getTranslations("admin.tenant.photos"),
    loadTenantOverview(tenantId),
    adminQuery(async (tx) => ({
      active: await listActiveAssets(tx, tenantId),
      retired: await listRetiredAssets(tx, tenantId),
    })),
  ]);
  const kinds = ["gallery", "cover", "staff", "service", "other"] as const;
  return (
    <PhotosEditor
      tenantId={tenantId}
      locale={locale}
      contentLocale={overview.tenant.defaultLocale}
      limit={overview.plan.limits.photos}
      active={active}
      retired={retired}
      photoAction={photoAction}
      uploader={
        <div className="space-y-6">
          <PhotoCropUpload tenantId={tenantId} action={uploadPhotoAction} />
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-navy">{t("uploadNoCrop")}</summary>
            <ActionForm
              action={uploadPhotoAction}
              submitLabel={t("upload")}
              resetOnSuccess
              className="mt-4 space-y-4"
            >
              <Hidden values={{ tenantId }} />
              <div>
                <label htmlFor="photo-file" className={ui.label}>
                  {t("file")}
                </label>
                <input
                  id="photo-file"
                  name="file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif"
                  required
                  className="block w-full text-sm"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  name="kind"
                  label={t("kind")}
                  options={kinds.map((kind) => ({ value: kind, label: t(`kinds.${kind}`) }))}
                  defaultValue="gallery"
                />
                <TextField name="alt" label={t("alt")} />
              </div>
            </ActionForm>
          </details>
        </div>
      }
    />
  );
}
