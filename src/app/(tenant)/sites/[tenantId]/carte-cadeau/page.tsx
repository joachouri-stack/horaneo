import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SectionTitle } from "@/components/site/atelier/ui";
import { PageTitle } from "@/components/site/blocks";
import { GiftCardForm } from "@/components/giftcards/GiftCardForm";
import { withTenant } from "@/db/access";
import { paymentGateway } from "@/lib/payments/stripe";
import { getSite } from "@/lib/site/load";
import { utcToLocal } from "@/modules/booking/time";
import { giftCardOffer } from "@/modules/giftcards/giftcards";
import { isAtelier } from "@/modules/site/data";
import { SITE_PATHS } from "@/modules/site/paths";

export async function generateMetadata({
  params,
}: PageProps<"/sites/[tenantId]/carte-cadeau">): Promise<Metadata> {
  const site = await getSite((await params).tenantId);
  const t = await getTranslations({ locale: site.locale, namespace: "site.giftCard" });
  return { title: t("metaTitle"), alternates: { canonical: SITE_PATHS.giftCard } };
}

/**
 * Achat d'une carte cadeau. Sur un site à plusieurs entreprises, on choisit
 * d'abord chez qui : la carte est encaissée par elle et ne s'utilise que chez elle.
 */
export default async function GiftCardPage({
  params,
  searchParams,
}: PageProps<"/sites/[tenantId]/carte-cadeau">) {
  const { tenantId } = await params;
  const query = await searchParams;
  const site = await getSite(tenantId);
  const t = await getTranslations("site.giftCard");
  const sellers = site.businesses.filter((business) => site.giftCardBusinessIds.includes(business.id));
  const chosen = sellers.length === 1 ? sellers[0] : sellers.find((business) => business.id === query.avec);
  const title = isAtelier(site) ? (
    <SectionTitle as="h1" start={t("title")} className="mb-4" />
  ) : (
    <PageTitle title={t("title")} />
  );

  if (sellers.length === 0) {
    return (
      <main id="contenu" className="mx-auto max-w-2xl px-4 py-14">
        {title}
        <p className="text-lg">{t("unavailable")}</p>
      </main>
    );
  }

  // Retour après une validation bancaire hors du site (3-D Secure) : la carte part dès la confirmation de Stripe.
  if (typeof query.payment_intent === "string") {
    return (
      <main id="contenu" className="mx-auto max-w-2xl px-4 py-14">
        {title}
        <p role="status" className="text-lg">
          <strong>{t("thanksTitle")}</strong> {t("thanksPending")}
        </p>
      </main>
    );
  }

  const offer = chosen
    ? await withTenant(tenantId, (tx) => giftCardOffer(tx, tenantId, paymentGateway()), undefined, chosen.id)
    : null;

  return (
    <main id="contenu" className="mx-auto max-w-3xl px-4 py-14 sm:px-8">
      {title}
      <p className="mb-8 text-lg text-site-muted">{t("intro")}</p>

      {sellers.length > 1 && (
        <nav aria-label={t("who")} className="mb-8">
          <p className="mb-3 text-lg font-semibold">{t("who")}</p>
          <ul className="flex flex-wrap gap-2">
            {sellers.map((business) => (
              <li key={business.id}>
                <Link
                  href={`${SITE_PATHS.giftCard}?avec=${business.id}`}
                  aria-current={chosen?.id === business.id ? "true" : undefined}
                  className="inline-flex min-h-12 items-center rounded-full border border-site-border bg-site-card px-5 font-semibold aria-[current=true]:border-site-button aria-[current=true]:bg-site-button aria-[current=true]:text-site-on-button"
                >
                  {business.title ? `${business.title} · ${business.name}` : business.name}
                </Link>
              </li>
            ))}
          </ul>
          {chosen && <p className="mt-3 text-site-muted">{t("belongsTo", { name: chosen.name })}</p>}
        </nav>
      )}

      {offer && chosen && offer.available ? (
        <GiftCardForm
          businessId={chosen.id}
          businessName={sellers.length > 1 ? chosen.name : site.tenant.name}
          locale={site.locale}
          currency={site.tenant.currency}
          amounts={offer.amounts}
          minCents={offer.minCents}
          maxCents={offer.maxCents}
          validityMonths={offer.validityMonths}
          today={utcToLocal(new Date(), site.tenant.timezone).date}
          rulesPath={`${SITE_PATHS.cancellation}#cartes-cadeaux`}
          returnPath={`${SITE_PATHS.giftCard}?avec=${chosen.id}`}
        />
      ) : (
        chosen && <p className="text-lg">{t("unavailable")}</p>
      )}
    </main>
  );
}
