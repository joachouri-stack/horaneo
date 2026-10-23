import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ui } from "@/components/ui/styles";
import { Link, redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { getManagedTenants, requireSession } from "@/lib/auth/session";
import { withPlatform } from "@/db/access";
import { pickLocalized } from "@/i18n/locales";
import { ordersOfUser } from "@/modules/orders/orders";
import { getPlatformSetting } from "@/modules/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/espace">): Promise<Metadata> {
  const t = await getTranslations({ locale: resolveLocale((await params).locale), namespace: "account" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * Entrée de l'espace : ouvre l'établissement géré, propose le choix s'il y en a
 * plusieurs, ou montre où en est la commande tant que le site n'existe pas.
 * Une administratrice sans établissement arrive directement dans l'admin.
 */
export default async function AccountPage({ params }: PageProps<"/[locale]/espace">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireSession(locale, "/espace");
  const [t, managed] = await Promise.all([getTranslations("account"), getManagedTenants(session.user.id)]);
  const { user } = session;
  // Un seul établissement : on l'ouvre directement.
  if (managed.length === 1) redirect({ href: `/espace/${managed[0].id}`, locale });
  // Administratrice sans établissement à gérer : directement l'espace admin.
  if (managed.length === 0 && user.isPlatformAdmin) redirect({ href: "/admin", locale });
  const [tOrder, { orders, days }] = await Promise.all([
    getTranslations("order.status"),
    withPlatform(async (tx) => ({
      orders: managed.length === 0 ? await ordersOfUser(tx, session.user.id) : [],
      days: Number(await getPlatformSetting(tx, "go_live_delay_days")),
    })),
  ]);
  const order = orders[0];

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

        {managed.length === 0 && order && order.order.status !== "abandoned" ? (
          <section className={ui.card}>
            <h2 className="text-xl font-bold">{tOrder("title")}</h2>
            <p className="mt-2 font-semibold text-night">
              {order.order.businessName} · {pickLocalized(order.planName, locale)}
            </p>
            <p className="mt-1">{tOrder(order.order.status)}</p>
            {["paid", "awaiting_review", "in_creation"].includes(order.order.status) && (
              <p className="mt-1 text-ink/70">{tOrder("eta", { days })}</p>
            )}
            {order.order.status === "awaiting_payment" && (
              <Link
                href={{ pathname: "/commander", query: { pack: order.planCode } }}
                className={`mt-6 ${ui.primaryButton} sm:w-auto`}
              >
                {tOrder("resume")}
              </Link>
            )}
          </section>
        ) : managed.length === 0 ? (
          // Connectée avec une adresse sans espace (ancien compte, autre adresse) : on le dit, et on
          // propose de changer de compte avant de proposer un pack.
          <section className={ui.card}>
            <h2 className="text-xl font-bold">{t("noTenantTitle")}</h2>
            <p className="mt-2">{t("noTenantBody", { email: user.email })}</p>
            <SignOutButton
              to="/connexion"
              label={t("noTenantSwitch")}
              className={`mt-6 ${ui.primaryButton} sm:w-auto`}
            />
            <p className="mt-6 text-ink/70">
              {t("noTenantNew")}{" "}
              <Link href={{ pathname: "/", hash: "tarifs" }} className="font-semibold text-night underline">
                {t("noTenantCta")}
              </Link>
            </p>
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
          <Link href="/admin" className="inline-block font-semibold text-night underline">
            {t("adminLink")}
          </Link>
        )}
      </main>
    </>
  );
}
