import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, Section, TextField } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { centsToInput } from "@/lib/format";
import { managerPage } from "@/lib/manager/page";
import { firstPlanWith } from "@/modules/billing/plans";
import { loyaltyConfig } from "@/modules/loyalty/loyalty";
import { birthdayOfferConfig } from "@/modules/promo/birthday";
import { saveBirthdayOfferAction, saveLoyaltySettingsAction } from "../../actions";

/**
 * Réglages du programme de fidélité de l'entreprise (pack qui l'inclut) et de
 * l'offre d'anniversaire de ses clientes (pack avec les codes promo).
 */
export default async function LoyaltyPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/fidelite">) {
  const page = await managerPage(params);
  const [t, tCommon, tNotifications] = await Promise.all([
    getTranslations("manager.loyalty"),
    getTranslations("common"),
    getTranslations("notifications.customer.birthday"),
  ]);
  const [config, birthday] = await page.db(
    async (tx) =>
      [await loyaltyConfig(tx, page.tenantId), await birthdayOfferConfig(tx, page.tenantId)] as const,
  );
  const planWith = async (feature: "loyalty" | "promoCodes") =>
    (await page.db((tx) => firstPlanWith(tx, feature, page.locale))) ?? "none";
  // Nom affiché dans l'e-mail : l'entreprise sur un site à plusieurs, sinon le site.
  const businessName = page.multiBusiness ? page.business.name : page.tenant.name;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
        {t("title")}
      </h1>
      {config.included ? (
        <>
          <p className="text-ink/80">{t("intro")}</p>
          <Section title={t("card")}>
            <ActionForm
              action={saveLoyaltySettingsAction}
              submitLabel={tCommon("save")}
              className="space-y-4"
            >
              <Hidden values={{ tenantId: page.tenantId }} />
              <CheckboxField name="enabled" label={t("enabled")} defaultChecked={config.enabled} />
              <TextField
                name="visitsRequired"
                type="number"
                label={t("visitsRequired")}
                defaultValue={String(config.visitsRequired)}
                required
              />
              <TextField
                name="rewardLabel"
                label={t("rewardLabel")}
                hint={t("rewardLabelHint")}
                defaultValue={config.rewardLabel ?? ""}
              />
              <TextField
                name="rewardAmount"
                label={t("rewardAmount")}
                hint={t("rewardAmountHint")}
                defaultValue={config.rewardCents ? centsToInput(config.rewardCents) : ""}
              />
              <TextField
                name="validityDays"
                type="number"
                label={t("validityDays")}
                defaultValue={String(config.validityDays)}
                required
              />
            </ActionForm>
          </Section>
        </>
      ) : (
        <p className={ui.card}>{t("unavailable", { plan: await planWith("loyalty") })}</p>
      )}

      {birthday.included ? (
        <Section title={t("birthday.title")}>
          <p className="mb-4 text-ink/80">{t("birthday.intro")}</p>
          <ActionForm action={saveBirthdayOfferAction} submitLabel={tCommon("save")} className="space-y-4">
            <Hidden values={{ tenantId: page.tenantId }} />
            <CheckboxField name="enabled" label={t("birthday.enabled")} defaultChecked={birthday.enabled} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="discountPercent"
                type="number"
                inputMode="numeric"
                label={t("birthday.percent")}
                defaultValue={String(birthday.discountPercent)}
                required
              />
              <TextField
                name="validityDays"
                type="number"
                inputMode="numeric"
                label={t("birthday.days")}
                hint={t("birthday.daysHint")}
                defaultValue={String(birthday.validityDays)}
                id="f-birthday-validityDays"
                required
              />
            </div>
            {/* Aperçu : les textes mêmes de l'e-mail, avec les réglages enregistrés. */}
            <figure className="rounded-[var(--radius-card)] border-2 border-dashed border-navy/20 bg-mist-50 p-4">
              <figcaption className="text-sm font-semibold text-ink/70">{t("birthday.preview")}</figcaption>
              <p className="mt-2 font-semibold text-night">
                {tNotifications("subject", { firstName: t("birthday.sampleName") })}
              </p>
              <p className="mt-1 text-ink/80">
                {tNotifications("intro", { business: businessName, percent: birthday.discountPercent })}
              </p>
            </figure>
          </ActionForm>
        </Section>
      ) : (
        <p className={ui.card}>{t("birthday.unavailable", { plan: await planWith("promoCodes") })}</p>
      )}
    </div>
  );
}
