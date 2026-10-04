import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppHeader } from "@/components/layout/AppHeader";
import { ui } from "@/components/ui/styles";
import { Link, redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { getManagedTenants, requireSession } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/espace">): Promise<Metadata> {
  const t = await getTranslations({ locale: resolveLocale((await params).locale), namespace: "account" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * Espace de la gérante (provisoire). L'écran « Aujourd'hui », l'agenda et les
 * autres onglets arrivent à l'étape 7.
 */
export default async function AccountPage({ params }: PageProps<"/[locale]/espace">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireSession(locale, "/espace");
  const [t, managed] = await Promise.all([getTranslations("account"), getManagedTenants(session.user.id)]);
  const { user } = session;
  // Un seul établissement : on l'ouvre directement.
  if (managed.length === 1) redirect({ href: `/espace/${managed[0].id}`, locale });

  return (
    <>
      <AppHeader />
      <main id="contenu" className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-3xl font-extrabold">
            {user.name ? t("greeting", { name: user.name }) : t("greetingNoName")}
          </h1>
          <p className="mt-1 text-ink/70">{t("signedInAs", { email: user.email })}</p>
        </div>

        {managed.length === 0 ? (
          <section className={ui.card}>
            <h2 className="text-xl font-bold">{t("noTenantTitle")}</h2>
            <p className="mt-2">{t("noTenantBody")}</p>
            <Link href="/" className={`mt-6 ${ui.primaryButton} sm:w-auto`}>
              {t("noTenantCta")}
            </Link>
          </section>
        ) : (
          <section className={ui.card}>
            <h2 className="text-xl font-bold">{t("tenantsTitle")}</h2>
            <ul className="mt-4 space-y-2">
              {managed.map((tenant) => (
                <li key={tenant.id}>
                  <Link href={`/espace/${tenant.id}`} className={`${ui.secondaryButton} justify-start`}>
                    {tenant.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {user.isPlatformAdmin && (
          <Link href="/admin" className="inline-block font-semibold text-navy underline">
            {t("adminLink")}
          </Link>
        )}
      </main>
    </>
  );
}
