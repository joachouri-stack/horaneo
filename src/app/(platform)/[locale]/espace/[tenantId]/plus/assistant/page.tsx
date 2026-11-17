import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, Section, ToggleField } from "@/components/admin/fields";
import { chatModel } from "@/lib/ai/anthropic";
import { managerPage } from "@/lib/manager/page";
import { chatbotSettings } from "@/modules/chatbot/settings";
import { saveChatbotSettingsAction } from "../../actions";

/** Assistant du site (chatbot) : activé ou coupé par la gérante, conversations du mois. */
export default async function AssistantPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/assistant">) {
  const page = await managerPage(params, "owner");
  const [t, tCommon] = await Promise.all([getTranslations("manager.assistant"), getTranslations("common")]);
  const settings = await page.db((tx) => chatbotSettings(tx, page.tenantId));
  // Pack sans chatbot : la rubrique n'existe pas.
  if (!settings.included) notFound();
  const usage = settings.usage;
  const allowed = usage && usage.included !== null ? usage.included + usage.extra : null;
  const resetsOn = usage
    ? new Intl.DateTimeFormat(page.locale, { day: "numeric", month: "long" }).format(
        new Date(`${usage.resetsOn}T12:00:00Z`),
      )
    : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
          {t("title")}
        </h1>
        <p className="mt-1 text-ink-soft">{t("intro")}</p>
      </div>

      {!chatModel() && (
        <p className="rounded-xl bg-[#fdf3e2] px-4 py-3 text-[#8a5212]">{t("notConfigured")}</p>
      )}

      <Section title={t("settingsTitle")}>
        <ActionForm
          action={saveChatbotSettingsAction}
          submitLabel={tCommon("save")}
          successMessage={t("saved")}
          className="space-y-4"
        >
          <Hidden values={{ tenantId: page.tenantId }} />
          <ToggleField
            name="enabled"
            label={t("enabled")}
            hint={t("enabledHint")}
            defaultChecked={settings.enabled}
          />
        </ActionForm>
      </Section>

      {usage && (
        <Section title={t("usageTitle")}>
          <p className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
            {allowed === null
              ? t("usedUnlimited", { used: usage.used })
              : t("used", { used: usage.used, allowed })}
          </p>
          {allowed !== null && (
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-navy/10">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.min(100, allowed > 0 ? (usage.used / allowed) * 100 : 100)}%` }}
              />
            </div>
          )}
          <p className="mt-3 text-sm text-ink-soft">{t("resets", { date: resetsOn })}</p>
          {usage.remaining === 0 && (
            <p className="mt-2 text-sm font-medium text-[#8a5212]">{t("limitReached")}</p>
          )}
        </Section>
      )}

      <Section title={t("howTitle")}>
        <ul className="list-disc space-y-2 pl-5 text-ink-soft">
          <li>{t("how1")}</li>
          <li>{t("how2")}</li>
          <li>{t("how3")}</li>
        </ul>
      </Section>
    </div>
  );
}
