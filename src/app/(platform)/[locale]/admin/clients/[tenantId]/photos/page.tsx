import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, Section, SelectField, TextField } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { formatDate } from "@/lib/format";
import { storage } from "@/lib/storage";
import { listActiveAssets, listRetiredAssets } from "@/modules/media/assets";
import { photoAction, uploadPhotoAction } from "../../actions";

/** Photos d'un client : ajout par l'administratrice, retrait et restauration. */
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
  const photos = active.filter((asset) => asset.kind !== "logo");
  const limit = overview.plan.limits.photos;
  const store = storage();
  const kinds = ["gallery", "cover", "staff", "service", "other"] as const;

  return (
    <>
      <Section
        title={t("title")}
        aside={
          limit !== null && limit !== undefined ? (
            <span className="text-sm text-ink/70">{t("quota", { used: photos.length, limit })}</span>
          ) : null
        }
      >
        {photos.length === 0 && <p className="text-ink/70">{t("empty")}</p>}
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {photos.map((photo) => (
            <li key={photo.id} className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={store.publicUrl(photo.storageKey)}
                alt={pickLocalized(photo.alt, overview.tenant.defaultLocale as "fr")}
                width={photo.width ?? undefined}
                height={photo.height ?? undefined}
                loading="lazy"
                className="aspect-square w-full rounded-lg object-cover"
              />
              <p className="text-xs text-ink/60">{t(`kinds.${photo.kind as (typeof kinds)[number]}`)}</p>
              <ActionForm action={photoAction} submitLabel={t("remove")} variant="danger" className="">
                <Hidden values={{ tenantId, id: photo.id, operation: "retire" }} />
              </ActionForm>
            </li>
          ))}
        </ul>

        <div className="mt-6 border-t border-navy/10 pt-6">
          <ActionForm action={uploadPhotoAction} submitLabel={t("upload")} resetOnSuccess>
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
              <p className="mt-1 text-sm text-ink/60">{t("uploadHint")}</p>
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
        </div>
      </Section>

      {retired.length > 0 && (
        <Section title={t("restore")}>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {retired.map((photo) => (
              <li key={photo.id} className="space-y-2 opacity-80">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={store.publicUrl(photo.storageKey)}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full rounded-lg object-cover grayscale"
                />
                <p className="text-xs text-ink/60">
                  {t("trashItem", { date: formatDate(photo.purgeAfter, locale) })}
                </p>
                <ActionForm action={photoAction} submitLabel={t("restore")} variant="link" className="">
                  <Hidden values={{ tenantId, id: photo.id, operation: "restore" }} />
                </ActionForm>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
