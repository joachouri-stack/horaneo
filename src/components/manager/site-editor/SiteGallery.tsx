import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden } from "@/components/admin/fields";
import { PhotoCropUpload } from "@/components/manager/PhotoCropUpload";
import { pickLocalized } from "@/i18n/locales";
import type { ActionResult } from "@/lib/actions/result";
import { formatDate } from "@/lib/format";
import { storage } from "@/lib/storage";
import type { listActiveAssets } from "@/modules/media/assets";

type Action = (previous: ActionResult<unknown> | null, data: FormData) => Promise<ActionResult<unknown>>;
type Assets = Awaited<ReturnType<typeof listActiveAssets>>;

/**
 * Photos de la galerie du site : vignettes à ranger ou retirer, ajout direct dans la galerie
 * (sans choix d'emplacement), photos retirées récupérables quelques jours.
 */
export async function SiteGallery({
  tenantId,
  locale,
  contentLocale,
  limit,
  photos,
  retired,
  photoAction,
  uploadAction,
}: {
  tenantId: string;
  locale: string;
  contentLocale: string;
  limit: number | null | undefined;
  photos: Assets;
  retired: Assets;
  photoAction: Action;
  uploadAction: Action;
}) {
  const [t, tPhotos] = await Promise.all([
    getTranslations("manager.site.editor.gallery"),
    getTranslations("admin.tenant.photos"),
  ]);
  const store = storage();
  return (
    <div className="space-y-5">
      {limit !== null && limit !== undefined && (
        <p className="text-sm text-ink/70">{tPhotos("quota", { used: photos.length, limit })}</p>
      )}
      {photos.length === 0 ? (
        <p className="text-ink/70">{t("empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="space-y-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={store.publicUrl(photo.storageKey)}
                alt={pickLocalized(photo.alt, contentLocale as "fr")}
                loading="lazy"
                className="aspect-square w-full rounded-xl object-cover"
              />
              <div className="flex flex-wrap items-center gap-x-3 text-sm">
                {index > 0 && (
                  <ActionForm action={photoAction} submitLabel={`← ${tPhotos("moveUp")}`} variant="link">
                    <Hidden values={{ tenantId, id: photo.id, operation: "up" }} />
                  </ActionForm>
                )}
                {index < photos.length - 1 && (
                  <ActionForm action={photoAction} submitLabel={`${tPhotos("moveDown")} →`} variant="link">
                    <Hidden values={{ tenantId, id: photo.id, operation: "down" }} />
                  </ActionForm>
                )}
                <ActionForm action={photoAction} submitLabel={t("remove")} variant="danger">
                  <Hidden values={{ tenantId, id: photo.id, operation: "retire" }} />
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      )}
      {photos.length > 1 && <p className="text-sm text-ink/70">{t("orderHint")}</p>}
      <PhotoCropUpload
        tenantId={tenantId}
        action={uploadAction}
        kind="gallery"
        chooseLabel={t("add")}
        doneLabel={t("added")}
      />
      {retired.length > 0 && (
        <details className="rounded-xl bg-mist-50 p-3">
          <summary className="min-h-11 cursor-pointer content-center font-medium text-night">
            {t("retired", { count: retired.length })}
          </summary>
          <ul className="mt-3 grid grid-cols-3 gap-3">
            {retired.map((photo) => (
              <li key={photo.id} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={store.publicUrl(photo.storageKey)}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full rounded-lg object-cover grayscale"
                />
                <p className="text-xs text-ink/70">
                  {tPhotos("trashItem", { date: formatDate(photo.purgeAfter, locale) })}
                </p>
                <ActionForm action={photoAction} submitLabel={tPhotos("restore")} variant="link">
                  <Hidden values={{ tenantId, id: photo.id, operation: "restore" }} />
                </ActionForm>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
