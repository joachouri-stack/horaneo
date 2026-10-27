import { AdminSubNav } from "@/components/admin/AdminSubNav";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, TextField } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { requireAdmin } from "@/lib/auth/session";
import { centsToInput, formatMoney } from "@/lib/format";
import { listPlanOptions } from "@/modules/billing/options";
import { savePlanOptionAction } from "./actions";

/** Options à la carte : tarifs et disponibilité (réglages, jamais écrits dans le code). */
export default async function OptionsPage({ params }: PageProps<"/[locale]/admin/options">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, tCommon, options] = await Promise.all([
    getTranslations("admin.options"),
    getTranslations("common"),
    adminQuery((tx) => listPlanOptions(tx, { all: true })),
  ]);
  const nameOf = (code: string) => {
    const option = options.find((item) => item.code === code);
    return option ? pickLocalized(option.name, locale) : code;
  };
  return (
    <main id="contenu" className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-extrabold">{t("title")}</h1>
      <AdminSubNav group="plans" current="/admin/options" />
      <p className="text-ink/80">{t("intro")}</p>
      {options.map((option) => (
        // Une option repliée : son nom, son tarif et sa disponibilité ; on l'ouvre pour la modifier.
        <details key={option.id} className={`${ui.card} group`}>
          <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-night">{pickLocalized(option.name, locale)}</h2>
            <span className="text-sm text-ink/70">
              {option.priceCents === null
                ? t("noPrice")
                : t("perMonth", { amount: formatMoney(option.priceCents, option.currency, locale) })}
              {" · "}
              {option.isActive ? t("onSale") : t("notOnSale")}
              <span className="ml-2 font-semibold text-night underline group-open:hidden">{t("edit")}</span>
            </span>
          </summary>
          {option.requires.length > 0 && (
            <p className="mt-3 text-sm text-ink/70">
              {t("requires", { names: option.requires.map(nameOf).join(", ") })}
            </p>
          )}
          <ActionForm action={savePlanOptionAction} submitLabel={tCommon("save")} className="mt-4 space-y-4">
            <Hidden values={{ optionId: option.id }} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id={`name-${option.id}`}
                name="name"
                label={t("name")}
                defaultValue={option.name.fr}
                required
              />
              <TextField
                id={`price-${option.id}`}
                name="price"
                inputMode="decimal"
                label={t("price")}
                hint={t("priceHint")}
                defaultValue={option.priceCents === null ? "" : centsToInput(option.priceCents)}
              />
            </div>
            <TextField
              id={`description-${option.id}`}
              name="description"
              label={t("description")}
              defaultValue={option.description?.fr ?? ""}
            />
            <div className="grid sm:grid-cols-2">
              <CheckboxField name="isActive" label={t("isActive")} defaultChecked={option.isActive} />
              <CheckboxField
                name="isAvailable"
                label={t("isAvailable")}
                defaultChecked={option.isAvailable}
              />
            </div>
            <p className="text-sm text-ink/60">{option.stripePriceId ? t("cardReady") : t("noStripe")}</p>
          </ActionForm>
        </details>
      ))}
    </main>
  );
}
