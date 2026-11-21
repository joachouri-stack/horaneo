import { getTranslations } from "next-intl/server";
import type { SetupStep } from "@/modules/setup/site-setup";

/** Étapes de mise en route du site : faites (coche), en cours (mise en avant), à venir. */
export async function SetupSteps({ steps }: { steps: SetupStep[] }) {
  const t = await getTranslations("manager.setup");
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li
          key={step.key}
          className="flex items-start gap-3"
          aria-current={step.state === "current" ? "step" : undefined}
        >
          <span
            aria-hidden="true"
            className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
              step.state === "done"
                ? "bg-success-soft text-success-ink"
                : step.state === "current"
                  ? "bg-accent text-white"
                  : "bg-mist-50 text-ink-soft"
            }`}
          >
            {step.state === "done" ? "✓" : index + 1}
          </span>
          <span className="min-w-0 pt-1">
            <span className={`block font-medium ${step.state === "todo" ? "text-ink-soft" : "text-night"}`}>
              {t(`steps.${step.key}.title`)}
              <span className="sr-only"> · {t(`state.${step.state}`)}</span>
            </span>
            {step.state === "current" && (
              <span className="mt-0.5 block text-sm text-ink-soft">{t(`steps.${step.key}.hint`)}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
