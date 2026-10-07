import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, Section, SelectField, TextArea, TextField } from "@/components/admin/fields";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { requireAdmin } from "@/lib/auth/session";
import { centsToInput } from "@/lib/format";
import { getPlatformSetting } from "@/modules/settings";
import { listShowcase, SHOWCASE_MAX } from "@/modules/showcase/showcase";
import { saveSettingsAction } from "../packs/actions";
import { addShowcaseAction, removeShowcaseAction } from "./actions";

/** Réglages généraux : affichage des prix, engagement, frais, délais, messages. */
export default async function SettingsPage({ params }: PageProps<"/[locale]/admin/reglages">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, tCommon] = await Promise.all([getTranslations("admin.settings"), getTranslations("common")]);
  const s = await adminQuery(async (tx) => {
    const keys = [
      "prices_display",
      "vat_rate_percent",
      "commitment_months",
      "setup_fee_cents",
      "go_live_delay_days",
      "deposit_commission_percent",
      "retention_days_after_cancel",
      "replaced_asset_retention_days",
      "sms_reminder_time",
      "email_reminder_hours_before",
      "daily_summary_time",
      "monthly_summary_time",
      "legal_infrastructure",
    ] as const;
    return Object.fromEntries(
      await Promise.all(keys.map(async (key) => [key, await getPlatformSetting(tx, key)])),
    ) as Record<(typeof keys)[number], string | number>;
  });
  const showcase = await adminQuery((tx) => listShowcase(tx));
  const field = (name: Exclude<keyof typeof s, "setup_fee_cents">, type = "number", hint?: string) => (
    <TextField name={name} type={type} label={t(name)} defaultValue={s[name]} hint={hint} required />
  );
  return (
    <main id="contenu" className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-extrabold">{t("title")}</h1>
      <ActionForm action={saveSettingsAction} submitLabel={tCommon("save")} className="space-y-6">
        <Section title={t("pricing")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              name="prices_display"
              label={t("prices_display")}
              defaultValue={String(s.prices_display)}
              options={[
                { value: "TTC", label: "TTC" },
                { value: "HT", label: "HT" },
              ]}
            />
            {field("vat_rate_percent", "number", t("vatHint"))}
            {field("commitment_months")}
            <TextField
              name="setup_fee"
              inputMode="decimal"
              label={t("setup_fee")}
              defaultValue={centsToInput(Number(s.setup_fee_cents))}
              required
            />
            {field("go_live_delay_days")}
          </div>
        </Section>
        <Section title={t("payments")}>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("deposit_commission_percent")}
            {field("retention_days_after_cancel")}
            {field("replaced_asset_retention_days")}
          </div>
        </Section>
        <Section title={t("messages")}>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("sms_reminder_time", "time")}
            {field("email_reminder_hours_before")}
            {field("daily_summary_time", "time")}
            {field("monthly_summary_time", "time")}
          </div>
        </Section>
        <Section title={t("legal")}>{field("legal_infrastructure", "text")}</Section>
      </ActionForm>

      {/* Bloc « Ils nous font confiance » de l'accueil : caché tant qu'il est vide. */}
      <Section title={t("showcase.title")}>
        <p className="mb-4 text-sm text-ink/70">{t("showcase.intro", { max: SHOWCASE_MAX })}</p>
        {showcase.length > 0 && (
          <ul className="mb-6 space-y-3">
            {showcase.map((entry) => (
              <li key={entry.id} className="rounded-[var(--radius-card)] border-2 border-line bg-white p-4">
                <p className="text-ink">« {entry.quote} »</p>
                <p className="mt-2 text-sm font-semibold text-night">
                  {entry.author} · {entry.name}
                </p>
                <p className="text-sm text-ink/70">
                  {[entry.activity, entry.url].filter(Boolean).join(" · ")}
                </p>
                <ActionForm
                  action={removeShowcaseAction}
                  submitLabel={t("showcase.remove")}
                  variant="danger"
                  confirm={t("showcase.removeConfirm", { name: entry.name })}
                  className="mt-2 space-y-2"
                >
                  <Hidden values={{ id: entry.id }} />
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
        {showcase.length < SHOWCASE_MAX && (
          <ActionForm action={addShowcaseAction} submitLabel={t("showcase.add")} resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="name" label={t("showcase.name")} required />
              <TextField
                name="activity"
                label={t("showcase.activity")}
                hint={t("showcase.activityHint")}
                required
              />
              <TextField
                name="author"
                label={t("showcase.author")}
                hint={t("showcase.authorHint")}
                required
              />
              <TextField
                name="url"
                type="url"
                inputMode="url"
                label={t("showcase.url")}
                hint={t("showcase.urlHint")}
              />
            </div>
            <TextArea
              name="quote"
              label={t("showcase.quote")}
              hint={t("showcase.quoteHint")}
              rows={3}
              required
            />
          </ActionForm>
        )}
      </Section>
    </main>
  );
}
