import { AdminSubNav } from "@/components/admin/AdminSubNav";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, SelectField, TextField } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { requireAdmin } from "@/lib/auth/session";
import { centsToInput, formatMoney } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { getPlatformSetting } from "@/modules/settings";
import { FEATURE_KEYS } from "@/modules/billing/admin";
import { planAllowsBooking } from "@/modules/billing/features";
import { listPlans } from "@/modules/tenants/queries";
import { savePlanAction } from "./actions";

const LIMITS = ["pages", "onlineBookingsPerMonth", "customers", "members", "photos", "services"] as const;
/** Quotas mensuels des outils intelligents : 0 = non inclus, vide = illimité. */
const AI_LIMITS = [
  "aiChatConversations",
  "chatbotQuestions",
  "whatsappConversations",
  "aiTexts",
  "aiImages",
  "extraLanguages",
] as const;

/**
 * Packs : prix, limites et fonctions (réglages, jamais écrits dans le code). La page ne montre
 * que la liste ; le formulaire d'un pack s'ouvre à la demande (« Modifier » → ?modifier=<code>).
 */
export default async function PlansPage({ params, searchParams }: PageProps<"/[locale]/admin/packs">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const editing = (await searchParams).modifier;
  const [t, { plans, noticeDays }] = await Promise.all([
    getTranslations("admin.plans"),
    adminQuery(async (tx) => ({
      plans: await listPlans(tx),
      noticeDays: await getPlatformSetting(tx, "price_change_notice_days"),
    })),
  ]);
  const onSale = plans.filter((plan) => plan.isPublic);
  const old = plans.filter((plan) => !plan.isPublic);

  const row = (plan: (typeof plans)[number]) => {
    const open = plan.code === editing;
    return (
      <li key={plan.id} id={`pack-${plan.code}`} className={ui.card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-night">{pickLocalized(plan.name, locale)}</h2>
          <span className="flex flex-wrap items-center gap-x-3 text-sm text-ink/70">
            {plan.priceCents > 0
              ? t("perMonth", { price: formatMoney(plan.priceCents, plan.currency, locale) })
              : t("free")}
            {" · "}
            {plan.isPublic ? t("onSale") : t("notOnSale")}
            <Link
              href={
                open
                  ? "/admin/packs"
                  : `/admin/packs?modifier=${encodeURIComponent(plan.code)}#pack-${plan.code}`
              }
              scroll={false}
              className="inline-flex min-h-11 items-center font-semibold text-night underline"
            >
              {open ? t("close") : t("edit")}
            </Link>
          </span>
        </div>
        {open && <PlanEditor plan={plan} plans={plans} noticeDays={Number(noticeDays)} />}
      </li>
    );
  };

  return (
    <main id="contenu" className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-extrabold">{t("title")}</h1>
      <AdminSubNav group="plans" current="/admin/packs" />
      <p className="text-ink/80">{t("intro")}</p>
      <ul className="space-y-3">{onSale.map(row)}</ul>
      {/* Anciens packs : plus en vente, gardés pour les clients qui les ont encore. */}
      {old.length > 0 && (
        <details className="space-y-3" open={old.some((plan) => plan.code === editing)}>
          <summary className="cursor-pointer py-2.5 text-lg font-bold text-night">
            {t("oldPlans", { count: old.length })}
          </summary>
          <p className="mb-3 text-sm text-ink/70">{t("oldPlansHint")}</p>
          <ul className="space-y-3">{old.map(row)}</ul>
        </details>
      )}
      {/* Lien partagé ou pack inconnu : rien à ouvrir. */}
      {editing && !plans.some((plan) => plan.code === editing) && <p className={ui.error}>{t("unknown")}</p>}
    </main>
  );
}

/** Formulaire complet d'un pack (affiché seulement pour le pack ouvert). */
async function PlanEditor({
  plan,
  plans,
  noticeDays,
}: {
  plan: Awaited<ReturnType<typeof listPlans>>[number];
  plans: Awaited<ReturnType<typeof listPlans>>;
  noticeDays: number;
}) {
  const [t, tCommon] = await Promise.all([getTranslations("admin.plans"), getTranslations("common")]);
  const locale = resolveLocale(await getLocale());
  return (
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
          hint={t("priceHint", { days: noticeDays })}
          defaultValue={centsToInput(plan.priceCents)}
          required
        />
        <TextField
          id={`noCommitmentFee-${plan.id}`}
          name="noCommitmentFee"
          inputMode="decimal"
          label={t("noCommitmentFee")}
          hint={t("noCommitmentFeeHint")}
          defaultValue={plan.noCommitmentFeeCents === null ? "" : centsToInput(plan.noCommitmentFeeCents)}
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
        <summary className="cursor-pointer py-2.5 font-semibold text-night">{t("features")}</summary>
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
  );
}
