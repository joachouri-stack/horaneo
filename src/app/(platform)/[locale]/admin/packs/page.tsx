import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, SelectField, TextField } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { requireAdmin } from "@/lib/auth/session";
import { centsToInput } from "@/lib/format";
import { FEATURE_KEYS } from "@/modules/billing/admin";
import { planAllowsBooking } from "@/modules/billing/features";
import { EVERYTHING_IN, HIGHLIGHT_KEYS, MAX_HIGHLIGHTS } from "@/modules/billing/showcase";
import { listPlans } from "@/modules/tenants/queries";
import { savePlanAction } from "./actions";

const LIMITS = ["onlineBookingsPerMonth", "members", "photos", "services"] as const;

/** Packs : prix, limites et fonctions (réglages, jamais écrits dans le code). */
export default async function PlansPage({ params }: PageProps<"/[locale]/admin/packs">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, tCommon, plans] = await Promise.all([
    getTranslations("admin.plans"),
    getTranslations("common"),
    adminQuery((tx) => listPlans(tx)),
  ]);
  return (
    <main id="contenu" className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-extrabold">{t("title")}</h1>
      <p className="text-ink/80">{t("intro")}</p>
      {plans.map((plan) => (
        <section key={plan.id} className={ui.card} aria-labelledby={`plan-${plan.id}`}>
          <h2 id={`plan-${plan.id}`} className="mb-4 text-xl font-bold text-night">
            {pickLocalized(plan.name, locale)}{" "}
            <span className="text-sm font-normal text-ink/60">({plan.code})</span>
          </h2>
          <ActionForm action={savePlanAction} submitLabel={tCommon("save")} className="space-y-4">
            <Hidden values={{ planId: plan.id }} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id={`name-${plan.id}`}
                name="name"
                label={t("name")}
                defaultValue={plan.name.fr}
                required
              />
              <TextField
                id={`description-${plan.id}`}
                name="description"
                label={t("description")}
                hint={t("descriptionHint")}
                defaultValue={plan.description?.fr ?? ""}
              />
              <TextField
                id={`price-${plan.id}`}
                name="price"
                inputMode="decimal"
                label={t("price")}
                hint={t("priceHint")}
                defaultValue={centsToInput(plan.priceCents)}
                required
              />
              <TextField
                id={`noCommitmentFee-${plan.id}`}
                name="noCommitmentFee"
                inputMode="decimal"
                label={t("noCommitmentFee")}
                hint={t("noCommitmentFeeHint")}
                defaultValue={
                  plan.noCommitmentFeeCents === null ? "" : centsToInput(plan.noCommitmentFeeCents)
                }
              />
              {/* Pack « site seul » : le pack avec réservation qui le reprend entièrement. */}
              {!planAllowsBooking(plan.features) && (
                <SelectField
                  id={`twin-${plan.id}`}
                  name="bookingTwinCode"
                  label={t("bookingTwin")}
                  hint={t("bookingTwinHint")}
                  defaultValue={plan.bookingTwinCode ?? ""}
                  options={[
                    { value: "", label: t("none") },
                    ...plans
                      .filter((item) => planAllowsBooking(item.features))
                      .map((item) => ({ value: item.code, label: pickLocalized(item.name, locale) })),
                  ]}
                />
              )}
              {LIMITS.map((key) => (
                <TextField
                  key={key}
                  id={`${key}-${plan.id}`}
                  name={key}
                  type="number"
                  inputMode="numeric"
                  label={t(key)}
                  hint={t("unlimitedHint")}
                  defaultValue={plan.limits[key] ?? ""}
                />
              ))}
              <TextField
                id={`sms-${plan.id}`}
                name="smsPerMonth"
                type="number"
                inputMode="numeric"
                label={t("smsPerMonth")}
                defaultValue={plan.limits.smsPerMonth ?? 0}
                required
              />
            </div>
            <fieldset>
              <legend className={ui.label}>{t("features")}</legend>
              <div className="grid sm:grid-cols-2">
                {FEATURE_KEYS.map((key) => (
                  <CheckboxField
                    key={key}
                    name={`feature_${key}`}
                    label={t(`featureLabels.${key}`)}
                    defaultChecked={Boolean(plan.features[key])}
                  />
                ))}
              </div>
            </fieldset>
            {/* Lignes visibles sur la carte du pack (site commercial) ; le reste se déplie. */}
            <fieldset>
              <legend className={ui.label}>{t("highlights")}</legend>
              <p className="mb-2 text-sm text-ink/70">{t("highlightsHint", { max: MAX_HIGHLIGHTS })}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: MAX_HIGHLIGHTS }, (_, index) => (
                  <SelectField
                    key={index}
                    id={`highlight-${plan.id}-${index}`}
                    name={`highlight_${index}`}
                    label={t("highlightLine", { n: index + 1 })}
                    defaultValue={plan.highlights[index] ?? ""}
                    options={[
                      { value: "", label: t("none") },
                      ...plans
                        .filter((item) => item.id !== plan.id)
                        .map((item) => ({
                          value: `${EVERYTHING_IN}${item.code}`,
                          label: t("everythingIn", { plan: pickLocalized(item.name, locale) }),
                        })),
                      ...HIGHLIGHT_KEYS.map((key) => ({
                        value: key,
                        label: t(`highlightLabels.${key}` as "highlightLabels.basePage"),
                      })),
                    ]}
                  />
                ))}
              </div>
            </fieldset>
            <CheckboxField name="isPublic" label={t("isPublic")} defaultChecked={plan.isPublic} />
            <p className="text-sm text-ink/60">
              {plan.stripePriceId ? t("stripe", { id: plan.stripePriceId }) : t("noStripe")}
            </p>
          </ActionForm>
        </section>
      ))}
    </main>
  );
}
