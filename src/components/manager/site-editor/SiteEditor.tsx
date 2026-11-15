import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, TextArea, TextField } from "@/components/admin/fields";
import {
  CameraLine,
  ClockLine,
  FileLine,
  LayoutLine,
  PaletteLine,
  StarLine,
  StoreLine,
  TagLine,
} from "@/components/marketing/line-icons";
import { LogoUpload } from "@/components/manager/LogoUpload";
import { PhotoCropUpload } from "@/components/manager/PhotoCropUpload";
import { PaletteChooser, type PaletteOption } from "@/components/manager/site-editor/PaletteChooser";
import { SiteBlock, SiteBlockLink } from "@/components/manager/site-editor/SiteBlock";
import { SiteEditorShell } from "@/components/manager/site-editor/SiteEditorShell";
import { SiteGallery } from "@/components/manager/site-editor/SiteGallery";
import { ui } from "@/components/ui/styles";
import { BRAND_PALETTES, type BrandPaletteKey } from "@/config/site";
import { authSecret } from "@/config/env";
import { assets, tenantDomains } from "@/db/schema";
import { pickLocalized, type LocalizedText } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import type { ActionResult } from "@/lib/actions/result";
import type { Transaction } from "@/db/client";
import { storage } from "@/lib/storage";
import { createPreviewToken, PREVIEW_PARAM } from "@/lib/tenancy/preview";
import { tenantSiteUrl } from "@/lib/tenancy/urls";
import { listServices } from "@/modules/catalog/services";
import { getPages, type PageContent } from "@/modules/content/pages";
import { listTestimonials } from "@/modules/content/testimonials";
import { listActiveAssets, listRetiredAssets } from "@/modules/media/assets";
import { listOpeningHours } from "@/modules/schedule/opening-hours";
import { buildTheme, type ThemeKey } from "@/modules/site/theme";

type Action = (previous: ActionResult<unknown> | null, data: FormData) => Promise<ActionResult<unknown>>;

export type SiteEditorProps = {
  tenantId: string;
  /** Fiche du site (logo, couleurs, ambiance, modèle, langue, statut). */
  tenant: {
    brand: {
      logoAssetId?: string | null;
      colors?: { primary?: string; secondary?: string } | null;
      originalColors?: { primary?: string; secondary?: string } | null;
    };
    theme: ThemeKey;
    templateKey: string;
    defaultLocale: string;
    status: string;
  };
  features: { testimonials?: boolean };
  limits: { photos?: number | null };
  /** Langue de l'interface. */
  locale: string;
  /** Lecture des données du site (rôle de la gérante ou de l'administratrice). */
  db: <T>(fn: (tx: Transaction) => Promise<T>) => Promise<T>;
  actions: {
    uploadLogo: Action;
    palette: Action;
    cover: Action;
    pageTexts: Action;
    photo: Action;
    uploadPhoto: Action;
  };
  /** Pages à part : prestations, horaires, avis, demande de modification (facultative). */
  links: { services: string; hours: string; testimonials: string; request?: string };
  /** Titre du haut de page : h1 dans l'espace gérante, h2 dans la fiche client de l'admin. */
  headingLevel?: 1 | 2;
  /** Établissement secondaire : seuls les blocs qui lui sont propres. */
  sharedContent?: boolean;
  /** Envoi du logo à la place de celui de la gérante (admin : couleurs proposées d'après le logo). */
  logoSlot?: React.ReactNode;
  /** Réglages en plus dans le bloc « Logo et couleurs » (admin : couleurs au code près). */
  brandExtra?: React.ReactNode;
  /** Blocs en plus, après ceux du site (admin : équipe, pages et référencement…). */
  extraBlocks?: React.ReactNode;
};

const ICON = "size-5";

/** Texte court pour un résumé : la première ligne, coupée proprement. */
function excerpt(value: string, max = 70) {
  const line =
    value
      .split("\n")
      .find((part) => part.trim())
      ?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/**
 * Éditeur du site (« Mon site » de la gérante, fiche client de l'admin) : les blocs du site dans
 * l'ordre où les clients les voient, chacun modifiable sur place, et l'aperçu du site à côté,
 * rechargé après chaque enregistrement.
 */
export async function SiteEditor({
  tenantId,
  tenant,
  features,
  limits,
  locale,
  db,
  actions,
  links,
  headingLevel = 1,
  sharedContent = false,
  logoSlot,
  brandExtra,
  extraBlocks,
}: SiteEditorProps) {
  const [t, tColors, tCommon] = await Promise.all([
    getTranslations("manager.site.editor"),
    getTranslations("manager.site.colors"),
    getTranslations("common"),
  ]);
  const contentLocale = resolveLocale(tenant.defaultLocale);
  const data = await db(async (tx) => {
    const [domains, services, hours, testimonials, pages, active, retired] = await Promise.all([
      tx
        .select({
          hostname: tenantDomains.hostname,
          isPrimary: tenantDomains.isPrimary,
          type: tenantDomains.type,
        })
        .from(tenantDomains)
        .where(eq(tenantDomains.tenantId, tenantId)),
      listServices(tx, tenantId),
      listOpeningHours(tx, tenantId),
      listTestimonials(tx, tenantId),
      getPages(tx, tenantId),
      listActiveAssets(tx, tenantId, { photosOnly: true }),
      listRetiredAssets(tx, tenantId, { photosOnly: true }),
    ]);
    const logoId = tenant.brand.logoAssetId;
    const [logo] = logoId
      ? await tx
          .select({ storageKey: assets.storageKey })
          .from(assets)
          .where(and(eq(assets.id, logoId), eq(assets.tenantId, tenantId)))
      : [];
    return { domains, services, hours, testimonials, pages, active, retired, logo };
  });
  const store = storage();

  // Aperçu : le site en ligne, ou (site pas encore publié) l'adresse provisoire avec un jeton d'aperçu.
  const draft = tenant.status === "draft";
  const primary = data.domains.find((domain) => domain.isPrimary);
  const host = draft ? (data.domains.find((domain) => domain.type === "subdomain") ?? primary) : primary;
  const live = tenant.status === "active" && primary;
  const previewSrc = host
    ? draft
      ? `${tenantSiteUrl(host.hostname)}/?${PREVIEW_PARAM}=${createPreviewToken(tenantId, authSecret())}`
      : live
        ? tenantSiteUrl(host.hostname)
        : null
    : null;

  // Textes des pages, dans la langue du site.
  const content = (key: string) =>
    (data.pages.find((item) => item.pageKey === key)?.content ?? {}) as PageContent;
  const text = (key: string, field: string) =>
    pickLocalized(content(key)[field] as LocalizedText | undefined, contentLocale);
  const home = content("home");
  const coverId = typeof home.coverAssetId === "string" ? home.coverAssetId : null;
  const cover = coverId ? data.active.find((asset) => asset.id === coverId) : undefined;
  const atelier = tenant.templateKey === "atelier";

  // Couleurs : palettes proposées (et celles d'origine du site), bouton montré comme sur le site.
  const { colors: currentColors, originalColors } = tenant.brand;
  const original = originalColors ?? currentColors;
  const keys = Object.keys(BRAND_PALETTES) as BrandPaletteKey[];
  const sameAs = (key: BrandPaletteKey, colors?: { primary?: string; secondary?: string }) =>
    BRAND_PALETTES[key].primary === colors?.primary?.toLowerCase() &&
    BRAND_PALETTES[key].secondary === colors?.secondary?.toLowerCase();
  const option = (value: string, label: string, primaryColor: string, secondary: string): PaletteOption => {
    const { button, onButton } = buildTheme(tenant.theme, { primary: primaryColor, secondary }).colors;
    return { value, label, primary: primaryColor, secondary, button, onButton };
  };
  const paletteOptions: PaletteOption[] = [
    ...(original?.primary && original.secondary && !keys.some((key) => sameAs(key, original))
      ? [option("original", tColors("original"), original.primary, original.secondary)]
      : []),
    ...keys.map((key) =>
      option(key, tColors(`palettes.${key}`), BRAND_PALETTES[key].primary, BRAND_PALETTES[key].secondary),
    ),
  ];
  const selectedPalette = keys.find((key) => sameAs(key, currentColors ?? undefined)) ?? "original";

  // Résumés des blocs fermés.
  const gallery = data.active.filter((asset) => asset.kind === "gallery");
  const galleryRetired = data.retired.filter((asset) => asset.kind === "gallery");
  const openDays = [...new Set(data.hours.map((range) => range.weekday))].sort((a, b) => a - b);
  const dayName = (weekday: number) =>
    // 5 janvier 2026 : un lundi (jour 1).
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2026, 0, 4 + weekday)),
    );
  const activeServices = data.services.filter((service) => service.isActive).length;
  const publishedTestimonials = data.testimonials.filter((item) => item.isPublished).length;
  const saved = t("saved");

  const textForm = (
    pageKey: "home" | "about" | "practical",
    fields: { name: string; long?: boolean; placeholder?: string; hint?: string }[],
  ) => (
    <ActionForm action={actions.pageTexts} submitLabel={tCommon("save")} successMessage={saved}>
      <Hidden values={{ tenantId: tenantId, pageKey }} />
      <div className="space-y-4">
        {fields.map((field) =>
          field.long ? (
            <TextArea
              key={field.name}
              id={`${pageKey}-${field.name}`}
              name={`text.${field.name}`}
              label={t(`fields.${pageKey}.${field.name}` as "fields.home.intro")}
              hint={field.hint}
              defaultValue={text(pageKey, field.name)}
              rows={4}
            />
          ) : (
            <TextField
              key={field.name}
              id={`${pageKey}-${field.name}`}
              name={`text.${field.name}`}
              label={t(`fields.${pageKey}.${field.name}` as "fields.home.intro")}
              hint={field.hint}
              placeholder={field.placeholder}
              defaultValue={text(pageKey, field.name)}
            />
          ),
        )}
      </div>
    </ActionForm>
  );

  const Heading = headingLevel === 1 ? "h1" : "h2";
  const header = (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Heading className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
          {t("title")}
        </Heading>
        <span
          className={`inline-flex items-center gap-1.5 text-sm font-medium ${live ? "text-success" : "text-ink/70"}`}
        >
          <span aria-hidden="true" className={`size-2 rounded-full ${live ? "bg-success" : "bg-ink/40"}`} />
          {live ? t("statusLive") : t("statusDraft")}
        </span>
      </div>
      {live && host && (
        <a
          href={tenantSiteUrl(host.hostname)}
          target="_blank"
          rel="noreferrer"
          className={`${ui.secondaryButton} sm:w-auto`}
        >
          {t("view")} ↗
        </a>
      )}
    </div>
  );

  const services = (
    <SiteBlockLink
      title={t("services.title")}
      summary={t("services.summary", { count: activeServices })}
      icon={<TagLine className={ICON} />}
      href={links.services}
    />
  );
  const hours = (
    <SiteBlockLink
      title={t("hours.title")}
      summary={
        openDays.length > 0 ? t("hours.summary", { days: openDays.map(dayName).join(", ") }) : t("hours.none")
      }
      icon={<ClockLine className={ICON} />}
      href={links.hours}
    />
  );
  const request = links.request ? (
    <p className="px-1 pt-1 text-sm text-ink/70">
      {t("request")}{" "}
      <Link href={links.request} className="font-semibold text-night underline">
        {t("requestCta")}
      </Link>
    </p>
  ) : null;

  const labels = {
    edit: t("tabs.edit"),
    preview: t("tabs.preview"),
    phone: t("phone"),
    desktop: t("desktop"),
    device: t("device"),
    loading: t("loading"),
    frameTitle: t("frameTitle"),
    previewTitle: t("previewTitle"),
  };
  // Empreinte du contenu du site : elle change après chaque enregistrement, et l'aperçu se recharge.
  const version = createHash("sha1")
    .update(
      JSON.stringify([
        tenant.brand,
        data.pages.map((item) => [item.pageKey, item.content, item.isPublished]),
        data.active.map((asset) => [asset.id, asset.sortOrder]),
        data.services.map((service) => [service.id, service.updatedAt]),
        data.hours,
        data.testimonials.map((item) => [item.id, item.updatedAt]),
      ]),
    )
    .digest("hex")
    .slice(0, 12);

  // Établissement secondaire : le contenu du site se gère depuis l'établissement principal.
  if (sharedContent) {
    return (
      <>
        {header}
        <SiteEditorShell previewSrc={previewSrc} version={version} labels={labels}>
          <p className={ui.card}>{t("sharedContent")}</p>
          {services}
          {hours}
          {request}
        </SiteEditorShell>
      </>
    );
  }

  return (
    <>
      {header}
      <SiteEditorShell previewSrc={previewSrc} version={version} labels={labels}>
        <SiteBlock
          title={t("brand.title")}
          icon={<PaletteLine className={ICON} />}
          summary={t("brand.summary")}
        >
          <div>
            <h3 className="font-semibold text-night">{t("brand.logo")}</h3>
            {logoSlot ?? (
              <LogoUpload
                tenantId={tenantId}
                logoUrl={data.logo ? store.publicUrl(data.logo.storageKey) : null}
                action={actions.uploadLogo}
              />
            )}
          </div>
          <div className="border-t border-hairline pt-4">
            <h3 className="mb-1 font-semibold text-night">{t("brand.colors")}</h3>
            <p className="mb-3 text-sm text-ink/70">{tColors("intro")}</p>
            <PaletteChooser
              tenantId={tenantId}
              options={paletteOptions}
              selected={selectedPalette}
              sampleLabel={tColors("sample")}
              doneLabel={saved}
              action={actions.palette}
            />
            {brandExtra}
          </div>
        </SiteBlock>

        <SiteBlock
          title={t("home.title")}
          icon={<LayoutLine className={ICON} />}
          summary={excerpt(text("home", "tagline")) || t("home.summary")}
          defaultOpen
        >
          <div className="flex items-start gap-4">
            <div className="aspect-video w-28 flex-none overflow-hidden rounded-xl bg-mist-50 sm:w-40">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.publicUrl(cover.storageKey)} alt="" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center p-2 text-center text-sm text-ink/60">
                  {t("home.noCover")}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-night">{t("home.cover")}</h3>
              <p className="mb-3 text-sm text-ink/70">{t("home.coverHint")}</p>
              <PhotoCropUpload
                tenantId={tenantId}
                action={actions.cover}
                kind="cover"
                chooseLabel={t(cover ? "home.changeCover" : "home.addCover")}
                doneLabel={saved}
              />
            </div>
          </div>
          <div className="border-t border-hairline pt-4">
            {textForm("home", [
              ...(atelier ? [{ name: "badge", placeholder: t("placeholders.badge") }] : []),
              { name: "tagline", placeholder: t("placeholders.tagline") },
              ...(atelier ? [{ name: "taglineAccent", placeholder: t("placeholders.taglineAccent") }] : []),
              { name: "intro", long: true },
            ])}
          </div>
        </SiteBlock>

        <SiteBlock
          title={t("about.title")}
          icon={<StoreLine className={ICON} />}
          summary={
            [text("about", "title"), excerpt(text("about", "body"), 50)].filter(Boolean).join(" · ") ||
            t("about.summary")
          }
        >
          {textForm("about", [
            { name: "title", placeholder: t("placeholders.aboutTitle") },
            { name: "body", long: true },
          ])}
        </SiteBlock>

        <SiteBlock
          title={t("gallery.title")}
          icon={<CameraLine className={ICON} />}
          summary={
            gallery.length > 0 ? (
              <span className="mt-1 flex gap-1.5">
                {gallery.slice(0, 5).map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={photo.id}
                    src={store.publicUrl(photo.storageKey)}
                    alt=""
                    loading="lazy"
                    className="size-8 rounded-lg object-cover"
                  />
                ))}
                {gallery.length > 5 && (
                  <span className="flex size-8 items-center justify-center rounded-lg bg-mist-50 text-xs font-semibold text-night">
                    +{gallery.length - 5}
                  </span>
                )}
              </span>
            ) : (
              t("gallery.summaryEmpty")
            )
          }
        >
          <SiteGallery
            tenantId={tenantId}
            locale={locale}
            contentLocale={tenant.defaultLocale}
            limit={limits.photos}
            photos={gallery}
            retired={galleryRetired}
            photoAction={actions.photo}
            uploadAction={actions.uploadPhoto}
          />
        </SiteBlock>

        {services}
        {hours}

        <SiteBlock
          title={t("practical.title")}
          icon={<FileLine className={ICON} />}
          summary={excerpt(text("practical", "access")) || t("practical.summary")}
        >
          {textForm("practical", [{ name: "access", long: true }])}
        </SiteBlock>

        {extraBlocks}
        {features.testimonials && (
          <SiteBlockLink
            title={t("testimonials.title")}
            summary={t("testimonials.summary", { count: publishedTestimonials })}
            icon={<StarLine className={ICON} />}
            href={links.testimonials}
          />
        )}
        {request}
      </SiteEditorShell>
    </>
  );
}
