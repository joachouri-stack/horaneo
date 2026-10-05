import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, Section, TextField } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { centsToInput } from "@/lib/format";
import { managerPage } from "@/lib/manager/page";
import { loyaltyConfig } from "@/modules/loyalty/loyalty";
import { saveLoyaltySettingsAction } from "../../actions";

/** Réglages du programme de fidélité de l'entreprise (pack qui l'inclut). */
export default async function LoyaltyPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/fidelite">) {
  const page = await managerPage(params);
  const [t, tCommon] = await Promise.all([getTranslations("manager.loyalty"), getTranslations("common")]);
  const config = await page.db((tx) => loyaltyConfig(tx, page.tenantId));

  if (!config.included) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <p className={ui.card}>{t("unavailable")}</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      <p className="text-ink/80">{t("intro")}</p>
      <Section title={t("card")}>
        <ActionForm action={saveLoyaltySettingsAction} submitLabel={tCommon("save")} className="space-y-4">
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
    </div>
  );
}
