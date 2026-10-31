import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, TextArea, TextField } from "@/components/admin/fields";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { ui } from "@/components/ui/styles";
import { withPlatform } from "@/db/access";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { SOLUTIONS, type Solution } from "@/modules/billing/grid";
import { listPublicPlans } from "@/modules/billing/plans";
import { requestCallbackAction } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/rappel">): Promise<Metadata> {
  const t = await getTranslations({ locale: resolveLocale((await params).locale), namespace: "callback" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * « Être rappelé » : tant que la commande en ligne des packs payants est
 * fermée (pages légales pas encore publiées), le visiteur laisse ses
 * coordonnées et l'équipe le rappelle.
 */
export default async function CallbackPage({ params, searchParams }: PageProps<"/[locale]/rappel">) {
  await connection();
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations("callback");
  const plans = await withPlatform((tx) => listPublicPlans(tx));
  const plan = plans.find((item) => item.code === query.pack);
  // « Être prévenu du lancement » d'une solution en préparation (Commerce, Formation…).
  const solution = SOLUTIONS.find((code) => code === query.solution) as Solution | undefined;
  const tHome = await getTranslations("home.solutions.items");

  return (
    <>
      <PlatformHeader />
      <main id="contenu" className="text-mk-body mx-auto max-w-2xl space-y-6 px-4 py-8">
        <div>
          <h1 className="font-display text-mk-h2 font-semibold tracking-[-0.025em]">{t("title")}</h1>
          <p className="mt-2 text-ink/80">
            {solution
              ? t("introSolution", { solution: tHome(`${solution}.name`) })
              : plan
                ? t("introPlan", { plan: pickLocalized(plan.name, locale) })
                : t("intro")}
          </p>
        </div>
        <div className={ui.card}>
          <ActionForm
            action={requestCallbackAction}
            submitLabel={t("submit")}
            resetOnSuccess
            className="space-y-5"
          >
            <Hidden values={{ planCode: plan?.code ?? "", solution: solution ?? "" }} />
            {/* Piège à robots : invisible et ignoré par les personnes. */}
            <div aria-hidden="true" className="hidden">
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <TextField name="name" label={t("name")} autoComplete="name" required />
            <TextField name="businessName" label={t("businessName")} autoComplete="organization" />
            <TextField
              name="phone"
              type="tel"
              inputMode="tel"
              label={t("phone")}
              autoComplete="tel"
              required
            />
            <TextField
              name="email"
              type="email"
              inputMode="email"
              label={t("email")}
              hint={t("emailHint")}
              autoComplete="email"
            />
            <TextArea name="message" label={t("message")} rows={4} />
          </ActionForm>
        </div>
      </main>
      <PlatformFooter />
    </>
  );
}
