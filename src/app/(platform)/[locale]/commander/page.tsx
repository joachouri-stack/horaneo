import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { TextField } from "@/components/admin/fields";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { ui } from "@/components/ui/styles";
import { withPlatform } from "@/db/access";
import { pickLocalized } from "@/i18n/locales";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { getManagedTenants, requireSession } from "@/lib/auth/session";
import { listPublicPlans } from "@/modules/billing/plans";
import { getPlatformSetting } from "@/modules/settings";
import { submitOrderAction } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/commander">): Promise<Metadata> {
  const t = await getTranslations({ locale: resolveLocale((await params).locale), namespace: "order" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * Commande : le pack choisi sur l'accueil, puis un court formulaire.
 * Sans compte, la connexion (ou l'inscription) se fait d'abord, puis retour ici.
 */
export default async function OrderPage({ params, searchParams }: PageProps<"/[locale]/commander">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const query = await searchParams;
  const pack = typeof query.pack === "string" ? query.pack : "";
  const session = await requireSession(
    locale,
    pack ? `/commander?pack=${encodeURIComponent(pack)}` : "/commander",
  );
  // Déjà cliente : le changement de pack se fait depuis son espace.
  if ((await getManagedTenants(session.user.id)).length > 0) redirect({ href: "/espace", locale });
  const [t, tHome] = await Promise.all([getTranslations("order"), getTranslations("home.plans")]);
  const { plans, display } = await withPlatform(async (tx) => ({
    plans: await listPublicPlans(tx),
    display: await getPlatformSetting(tx, "prices_display"),
  }));
  const selected =
    plans.find((plan) => plan.code === pack) ?? plans.find((plan) => plan.priceCents > 0) ?? plans[0];
  const money = (cents: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);

  return (
    <>
      <PlatformHeader />
      <main id="contenu" className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-3xl font-extrabold">{t("title")}</h1>
          <p className="mt-2 text-ink/80">{t("intro")}</p>
        </div>
        <div className={ui.card}>
          <ActionForm action={submitOrderAction} submitLabel={t("submit")} className="space-y-5">
            <fieldset>
              <legend className={ui.label}>{t("plan")}</legend>
              <div className="space-y-2">
                {plans.map((plan) => (
                  <label
                    key={plan.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-card)] border-2 border-navy/15 p-4 has-[:checked]:border-navy"
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="planCode"
                        value={plan.code}
                        defaultChecked={plan.id === selected?.id}
                        className="h-5 w-5 accent-navy"
                      />
                      <span className="font-bold text-navy">{pickLocalized(plan.name, locale)}</span>
                    </span>
                    <span className="text-right">
                      {plan.priceCents > 0
                        ? `${money(plan.priceCents)} ${tHome("perMonth", { display })}`
                        : tHome("free")}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <TextField name="businessName" label={t("businessName")} required />
            <TextField name="activity" label={t("activity")} hint={t("activityHint")} required />
            <TextField name="phone" type="tel" inputMode="tel" label={t("phone")} required />
            <TextField
              name="currentWebsite"
              inputMode="url"
              label={t("currentWebsite")}
              placeholder="www.exemple.fr"
            />
            <p className="text-sm text-ink/70">
              {t("paidHint")} {t("freeHint")}
            </p>
          </ActionForm>
        </div>
      </main>
    </>
  );
}
