import { AdminSubNav } from "@/components/admin/AdminSubNav";
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
import { listPlans } from "@/modules/tenants/queries";
import { savePlanAction } from "./actions";

const LIMITS = ["pages", "onlineBookingsPerMonth", "customers", "members", "photos", "services"] as const;
/** Quotas mensuels des outils intelligents : 0 = non inclus, vide = illimité. */
const AI_LIMITS = ["aiChatConversations", "whatsappConversations", "aiTexts", "aiImages"] as const;

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
      <AdminSubNav group="plans" current="/admin/packs" />
      <p className="text-ink/80">{t("intro")}</p>
      {plans.map((plan) => (
        // Un pack replié : son nom, son prix et sa visibilité ; on l'ouvre pour le modifier.
        <details key={plan.id} className={`${ui.card} group`}>
          <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2">
            <h2 id={`plan-${plan.id}`} className="text-xl font-bold text-night">
              {pickLocalized(plan.name, locale)}
            </h2>
            <span className="text-sm text-ink/70">
              {plan.priceCents > 0 ? t("perMonth", { price: centsToInput(plan.priceCents) }) : t("free")}
              {" · "}
              {plan.isPublic ? t("onSale") : t("notOnSale")}
              <span className="ml-2 font-semibold text-night underline group-open:hidden">{t("edit")}</span>
            </span>
          </summary>
          <ActionForm action={savePlanAction} submitLabel={tCommon("save")} className="mt-4 space-y-4">
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
              {!planAllowsBooking(plan.features) && plan.bookingTwinCode && (
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
              {AI_LIMITS.map((key) => (
                <TextField
                  key={key}
                  id={`${key}-${plan.id}`}
                  name={key}
                  type="number"
                  inputMode="numeric"
                  label={t(key)}
                  hint={t("aiLimitHint")}
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
            <details className="rounded-[var(--radius-card)] border border-navy/10 p-4">
              <summary className="cursor-pointer font-semibold text-night">{t("features")}</summary>
              <fieldset className="mt-3">
                <legend className="sr-only">{t("features")}</legend>
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
            </details>
            <CheckboxField name="isPublic" label={t("isPublic")} defaultChecked={plan.isPublic} />
            <p className="text-sm text-ink/60">{plan.stripePriceId ? t("cardReady") : t("noStripe")}</p>
          </ActionForm>
        </details>
      ))}
    </main>
  );
}
