import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/auth/LoginForm";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { ui } from "@/components/ui/styles";
import { env } from "@/config/env";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { enabledSocialProviders, safeRedirectPath } from "@/lib/auth/providers";
import { getCurrentSession } from "@/lib/auth/session";

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

  return (
    <>
      <PlatformHeader>
        <span />
      </PlatformHeader>
      <main id="contenu" className="mx-auto max-w-md px-4 py-10 sm:py-16">
        <div className={ui.card}>
          {/* Depuis « Commander » : la même page sert à créer son compte. */}
          <h1 className="text-3xl font-extrabold">{signup ? t("signupTitle") : t("title")}</h1>
          <p className="mt-3 text-ink/80">{signup ? t("signupSubtitle") : t("subtitle")}</p>
          {errorKey && (
            <p role="alert" className={`mt-6 ${ui.error}`}>
              {t(`errors.${errorKey}`)}
            </p>
          )}
          <LoginForm
            providers={enabledSocialProviders(env())}
            callbackPath={`/${locale}${suite}`}
            errorPath={`/${locale}/connexion`}
          />
        </div>
      </main>
    </>
  );
}
