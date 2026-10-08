import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, Section } from "@/components/admin/fields";
import { pickLocalized } from "@/i18n/locales";
import type { ActionResult } from "@/lib/actions/result";
import { formatDate } from "@/lib/format";
import { storage } from "@/lib/storage";
import type { listActiveAssets } from "@/modules/media/assets";

type Action = (previous: ActionResult<unknown> | null, data: FormData) => Promise<ActionResult<unknown>>;
type Assets = Awaited<ReturnType<typeof listActiveAssets>>;
type Kind = "gallery" | "cover" | "staff" | "service" | "other";

/** Photos d'un établissement : liste, retrait, restauration (formulaire d'envoi fourni par l'espace). */
export async function PhotosEditor({
  tenantId,
  locale,
  contentLocale,
  limit,
  active,
  retired,
  photoAction,
  uploader,
  headingLevel,
}: {
  tenantId: string;
  locale: string;
  contentLocale: string;
  limit: number | null | undefined;
  active: Assets;
  retired: Assets;
  photoAction: Action;
  uploader: React.ReactNode;
  /** Niveau du titre principal : 1 quand l'éditeur forme toute la page (espace gérante). */
  headingLevel?: 1 | 2;
}) {
  const t = await getTranslations("admin.tenant.photos");
  const photos = active.filter((asset) => asset.kind !== "logo");
  const store = storage();
  return (
    <>
      <Section
        title={t("title")}
        level={headingLevel}
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
                alt={pickLocalized(photo.alt, contentLocale as "fr")}
                width={photo.width ?? undefined}
                height={photo.height ?? undefined}
                loading="lazy"
                className="aspect-square w-full rounded-lg object-cover"
              />
              <p className="text-xs text-ink/60">{t(`kinds.${photo.kind as Kind}`)}</p>
              <ActionForm action={photoAction} submitLabel={t("remove")} variant="danger" className="">
                <Hidden values={{ tenantId, id: photo.id, operation: "retire" }} />
              </ActionForm>
            </li>
          ))}
        </ul>
        <div className="mt-6 border-t border-navy/10 pt-6">
          <p className="mb-4 text-sm text-ink/60">{t("uploadHint")}</p>
          {uploader}
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
