import { getTranslations } from "next-intl/server";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";

export const WIZARD_STEPS = [
  "coordonnees",
  "modele",
  "logo",
  "prestations",
  "horaires",
  "apercu",
  "domaine",
] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

/**
 * Bandeau du formulaire par étapes (création d'un client) : il réutilise les
 * écrans de la fiche, dans l'ordre du brief.
 */
export async function WizardNav({
  tenantId,
  current,
  active,
}: {
  tenantId: string;
  current: WizardStep;
  active: boolean;
}) {
  if (!active) return null;
  const t = await getTranslations("admin.wizard");
  const index = WIZARD_STEPS.indexOf(current);
  const next = WIZARD_STEPS[index + 1];
  const href = (step: WizardStep) =>
    step === "domaine"
      ? `/admin/clients/${tenantId}?assistant=1#domaines`
      : `/admin/clients/${tenantId}/${step}?assistant=1`;

  return (
    <div className="rounded-[var(--radius-card)] border-2 border-navy/15 bg-white p-4">
      <p className="text-sm font-semibold text-night">
        {t("step", { current: index + 1, total: WIZARD_STEPS.length })} · {t(`steps.${current}`)}
      </p>
      <ol className="mt-2 flex flex-wrap gap-2 text-sm">
        {WIZARD_STEPS.map((step, i) => (
          <li
            key={step}
            className={i === index ? "font-bold text-night" : i < index ? "text-success" : "text-ink/50"}
          >
            {i + 1}. {t(`steps.${step}`)}
          </li>
        ))}
      </ol>
      <div className="mt-3">
        {next ? (
          <Link href={href(next)} className={`${ui.secondaryButton} sm:w-auto`}>
            {t("next")} : {t(`steps.${next}`)} →
          </Link>
        ) : (
          <Link href={`/admin/clients/${tenantId}`} className={`${ui.secondaryButton} sm:w-auto`}>
            {t("finish")}
          </Link>
        )}
      </div>
    </div>
  );
}
