import { AdminSubNav } from "@/components/admin/AdminSubNav";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, TextArea, TextField } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { requireAdmin } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { listClaims, listLaunchOffers } from "@/modules/billing/launch-offers";
import { listPlans } from "@/modules/tenants/queries";
import { saveLaunchOfferAction, setClaimStatusAction } from "./actions";

const NEXT = {
  reserved: ["cancelled"],
  pending_review: ["eligible", "refused"],
  eligible: ["shipped", "refused"],
  shipped: [],
  refused: [],
  cancelled: [],
} as const;

/** Offres de lancement (cadeau aux premiers abonnés) : places réelles, conditions, suivi des bénéficiaires. */
export default async function LaunchOffersPage({ params }: PageProps<"/[locale]/admin/offres">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, tCommon] = await Promise.all([getTranslations("admin.launchOffers"), getTranslations("common")]);
  const { offers, plans } = await adminQuery(async (tx) => ({
    offers: await Promise.all(
      (await listLaunchOffers(tx)).map(async (offer) => ({ offer, claims: await listClaims(tx, offer.id) })),
    ),
    plans: await listPlans(tx),
  }));
  const planName = (code: string) => {
    const plan = plans.find((item) => item.code === code);
    return plan ? pickLocalized(plan.name, locale) : null;
  };
  return (
    <main id="contenu" className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-extrabold">{t("title")}</h1>
      <AdminSubNav group="plans" current="/admin/offres" />
      <p className="text-ink/80">{t("intro")}</p>
      {offers.length === 0 && <p className="text-ink/70">{t("none")}</p>}
      {offers.map(({ offer, claims }) => (
        <section key={offer.id} className={ui.card} aria-labelledby={`offre-${offer.id}`}>
          <h2 id={`offre-${offer.id}`} className="text-xl font-bold text-night">
            {pickLocalized(offer.title, locale)}
          </h2>
          {planName(offer.planCode) && (
            <p className="text-sm text-ink/70">{t("forPlan", { plan: planName(offer.planCode) ?? "" })}</p>
          )}
          <p className="mb-4 mt-1 text-sm font-semibold">
            {t("places", { taken: offer.taken, quota: offer.quota, remaining: offer.remaining })} ·{" "}
            {offer.open ? t("open") : t("closed")}
          </p>
          <ActionForm action={saveLaunchOfferAction} submitLabel={tCommon("save")} className="space-y-4">
            <Hidden values={{ offerId: offer.id }} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id={`title-${offer.id}`}
                name="title"
                label={t("offerTitle")}
                defaultValue={offer.title.fr}
                required
              />
              <TextField
                id={`quota-${offer.id}`}
                name="quota"
                type="number"
                inputMode="numeric"
                label={t("quota")}
                defaultValue={offer.quota}
                required
              />
              <TextField
                id={`ends-${offer.id}`}
                name="endsOn"
                type="date"
                label={t("endsOn")}
                hint={t("endsOnHint")}
                defaultValue={offer.endsAt ? offer.endsAt.toISOString().slice(0, 10) : ""}
              />
            </div>
            <TextArea
              name="conditions"
              label={t("conditions")}
              defaultValue={offer.conditions.fr}
              rows={4}
              required
            />
            <div className="grid sm:grid-cols-2">
              <CheckboxField name="isActive" label={t("isActive")} defaultChecked={offer.isActive} />
              <CheckboxField
                name="requiresCommitment"
                label={t("requiresCommitment")}
                defaultChecked={offer.requiresCommitment}
              />
            </div>
          </ActionForm>

          <h3 className="mb-2 mt-6 font-bold text-night">{t("claims")}</h3>
          {claims.length === 0 ? (
            <p className="text-sm text-ink/70">{t("noClaims")}</p>
          ) : (
            <ul className="divide-y divide-navy/10">
              {claims.map(({ claim, email, businessName, tenantName }) => (
                <li key={claim.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                  <span>
                    <span className="font-semibold text-night">
                      {tenantName ?? businessName ?? email ?? "—"}
                    </span>
                    <span className="block text-ink/70">
                      {t(`statuses.${claim.status}`)} · {formatDate(claim.createdAt, locale)}
                      {email && ` · ${email}`}
                    </span>
                    {claim.note && <span className="block text-ink/70">{claim.note}</span>}
                  </span>
                  <span className="flex flex-wrap gap-2">
                    {NEXT[claim.status].map((status) => (
                      <ActionForm
                        key={status}
                        action={setClaimStatusAction}
                        submitLabel={t(`actions.${status}`)}
                        variant={status === "refused" || status === "cancelled" ? "danger" : "secondary"}
                        // Refuser, libérer ou expédier : sans retour possible, on demande confirmation.
                        confirm={
                          status === "eligible"
                            ? undefined
                            : t(`confirm.${status}`, { name: tenantName ?? businessName ?? email ?? "" })
                        }
                        successMessage={t(`done.${status}`)}
                      >
                        <Hidden values={{ claimId: claim.id, status, note: "" }} />
                      </ActionForm>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  );
}
