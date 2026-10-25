import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { ui } from "@/components/ui/styles";
import { withPlatform } from "@/db/access";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { getCurrentSession } from "@/lib/auth/session";
import { billingGateway } from "@/lib/payments/stripe-billing";
import { AppError } from "@/modules/errors";
import { syncOrderPayment } from "@/modules/orders/orders";
import { getPlatformSetting } from "@/modules/settings";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/commander/merci">): Promise<Metadata> {
  const t = await getTranslations({
    locale: resolveLocale((await params).locale),
    namespace: "order.thanks",
  });
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Confirmation de commande : annonce le délai de mise en ligne (réglage). */
export default async function ThanksPage({ params, searchParams }: PageProps<"/[locale]/commander/merci">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const query = await searchParams;
  const orderId = typeof query.commande === "string" ? query.commande : "";
  // Commande passée sans compte : pas de connexion demandée pour voir sa confirmation.
  const session = await getCurrentSession();
  const t = await getTranslations("order.thanks");
  const { order, days } = await withPlatform(async (tx) => ({
    // Retour depuis Stripe : l'état du paiement est relu tout de suite.
    order: await syncOrderPayment(tx, session?.user.id ?? null, orderId, billingGateway()).catch((error) => {
      if (error instanceof AppError) return null;
      throw error;
    }),
    days: Number(await getPlatformSetting(tx, "go_live_delay_days")),
  }));
  const pending = !order || order.status === "awaiting_payment";
  const review = order?.status === "awaiting_review";

  return (
    <>
      <PlatformHeader />
      <main id="contenu" className="mx-auto max-w-2xl px-4 py-12">
        <section className={ui.card}>
          <h1 className="text-3xl font-extrabold">
            {pending ? t("pendingTitle") : review ? t("reviewTitle") : `✓ ${t("paidTitle")}`}
          </h1>
          {pending ? (
            <>
              <p className="mt-4">{t("pendingText")}</p>
              <Link
                href={{ pathname: "/commander/merci", query: { commande: orderId } }}
                className={`mt-6 ${ui.secondaryButton} sm:w-auto`}
              >
                {t("reload")}
              </Link>
            </>
          ) : (
            <>
              <p className="mt-4 text-lg">{review ? t("reviewNext", { days }) : t("next", { days })}</p>
              <Link href="/espace" className={`mt-6 ${ui.primaryButton} sm:w-auto`}>
                {t("space")}
              </Link>
              {!session && <p className="mt-3 text-sm text-ink/70">{t("spaceHint")}</p>}
            </>
          )}
        </section>
      </main>
    </>
  );
}
