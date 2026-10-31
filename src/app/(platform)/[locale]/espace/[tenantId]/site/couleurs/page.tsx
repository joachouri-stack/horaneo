import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden } from "@/components/admin/fields";
import { SharedContentNotice } from "@/components/manager/SharedContentNotice";
import { ui } from "@/components/ui/styles";
import { BRAND_PALETTES, type BrandPaletteKey } from "@/config/site";
import { readableTextOn } from "@/lib/colors";
import { managerPage } from "@/lib/manager/page";
import { savePaletteAction } from "../../actions";

const OPTION =
  "flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border border-hairline bg-white p-3 has-[:checked]:border-night has-[:checked]:ring-2 has-[:checked]:ring-night/15";
const RADIO = "size-5 flex-none accent-[#1b2a4a]";

/** Couleurs du site : la gérante choisit une palette (le site garde un contraste lisible). */
export default async function ManagerColorsPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/site/couleurs">) {
  const page = await managerPage(params);
  // Couleurs communes au site : changées depuis l'entreprise principale seulement.
  if (!page.business.isPrimary) return <SharedContentNotice />;
  const [t, tCommon] = await Promise.all([getTranslations("manager.site.colors"), getTranslations("common")]);
  const { colors: current, originalColors } = page.tenant.brand;
  // Couleurs de départ du site (avant toute palette) : toujours proposées pour y revenir.
  const original = originalColors ?? current;
  const keys = Object.keys(BRAND_PALETTES) as BrandPaletteKey[];
  const sameAs = (key: BrandPaletteKey, colors?: { primary?: string; secondary?: string }) =>
    BRAND_PALETTES[key].primary === colors?.primary?.toLowerCase() &&
    BRAND_PALETTES[key].secondary === colors?.secondary?.toLowerCase();
  const selected = keys.find((key) => sameAs(key, current));
  const sample = (primary: string) => (
    <span
      aria-hidden="true"
      className="rounded-lg px-2.5 py-1 text-sm font-semibold"
      style={{ background: primary, color: readableTextOn(primary) }}
    >
      {t("sample")}
    </span>
  );
  const swatch = (primary: string, secondary: string) => (
    <span aria-hidden="true" className="flex flex-none items-center gap-1.5">
      <span className="size-8 rounded-full border border-black/10" style={{ background: primary }} />
      <span className="size-8 rounded-full border border-black/10" style={{ background: secondary }} />
    </span>
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
          {t("title")}
        </h1>
        <p className="mt-1 text-ink/70">{t("intro")}</p>
      </div>
      <section className={ui.card}>
        <ActionForm action={savePaletteAction} submitLabel={tCommon("save")} successMessage={t("done")}>
          <Hidden values={{ tenantId: page.tenantId }} />
          <fieldset>
            <legend className="sr-only">{t("title")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {original?.primary && original.secondary && !keys.some((key) => sameAs(key, original)) && (
                <label className={OPTION}>
                  <input
                    type="radio"
                    name="palette"
                    value="original"
                    defaultChecked={!selected}
                    required
                    className={RADIO}
                  />
                  {swatch(original.primary, original.secondary)}
                  <span className="min-w-0 flex-1 font-medium text-night">{t("original")}</span>
                  {sample(original.primary)}
                </label>
              )}
              {keys.map((key) => {
                const { primary, secondary } = BRAND_PALETTES[key];
                return (
                  <label key={key} className={OPTION}>
                    <input
                      type="radio"
                      name="palette"
                      value={key}
                      defaultChecked={key === selected}
                      required
                      className={RADIO}
                    />
                    {swatch(primary, secondary)}
                    <span className="min-w-0 flex-1 font-medium text-night">{t(`palettes.${key}`)}</span>
                    {sample(primary)}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </ActionForm>
      </section>
    </div>
  );
}
