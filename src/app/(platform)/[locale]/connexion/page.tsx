import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/auth/LoginForm";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { ui } from "@/components/ui/styles";
import { env } from "@/config/env";
import { withPlatform } from "@/db/access";
import { pickLocalized } from "@/i18n/locales";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { enabledSocialProviders, safeRedirectPath } from "@/lib/auth/providers";
import { getCurrentSession } from "@/lib/auth/session";
import { listPublicPlans } from "@/modules/billing/plans";

export async function generateMetadata({ params }: PageProps<"/[locale]/connexion">): Promise<Metadata> {
  const t = await getTranslations({ locale: resolveLocale((await params).locale), namespace: "auth" });
  return { title: t("metaTitle"), robots: { index: false } };
}

const ERROR_KEYS = {
  lien: "linkExpired",
  social: "social",
} as const;

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/connexion">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const query = await searchParams;
  const suite = safeRedirectPath(typeof query.suite === "string" ? query.suite : null, "/espace");

  // Déjà connectée : direction l'espace demandé.
  if (await getCurrentSession()) redirect({ href: suite, locale });

  const t = await getTranslations("auth");
  const signup = suite.startsWith("/commander");
  const errorParam = typeof query.erreur === "string" ? query.erreur : null;
  const errorKey =
    errorParam && errorParam in ERROR_KEYS ? ERROR_KEYS[errorParam as keyof typeof ERROR_KEYS] : null;
  // Le texte ne cite que les connexions réellement proposées (Google, Apple ou aucune).
  const providers = enabledSocialProviders(env());
  const social = providers.length === 2 ? "both" : providers.length === 1 ? providers[0] : "none";
  // Depuis la page Tarifs : rappel du pack choisi.
  const packCode = signup ? new URLSearchParams(suite.split("?")[1] ?? "").get("pack") : null;
  const pack = packCode
    ? (await withPlatform((tx) => listPublicPlans(tx))).find((plan) => plan.code === packCode)
    : undefined;

  return (
    <>
      <PlatformHeader>
        <span />
      </PlatformHeader>
      <main id="contenu" className="text-mk-body mx-auto max-w-md px-4 py-10 sm:py-16">
        <div className={ui.card}>
          {/* Depuis « Commander » : la même page sert à créer son compte. */}
          <h1 className="font-display text-mk-h2 font-semibold tracking-[-0.025em]">
            {signup ? t("signupTitle") : t("title")}
          </h1>
          {pack && (
            <p className="mt-3 font-semibold">
              {t("chosenPack", { name: pickLocalized(pack.name, locale) })}
            </p>
          )}
          <p className="mt-3 text-ink/80">
            {signup ? t("signupSubtitle", { social }) : t("subtitle", { social })}
          </p>
          {errorKey && (
            <p role="alert" className={`mt-6 ${ui.error}`}>
              {t(`errors.${errorKey}`)}
            </p>
          )}
          <LoginForm
            providers={providers}
            callbackPath={`/${locale}${suite}`}
            errorPath={`/${locale}/connexion`}
          />
        </div>
      </main>
    </>
  );
}
