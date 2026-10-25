import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pickLocalized, type Locale, type LocalizedText } from "@/i18n/locales";
import { formatMoney } from "@/lib/format";
import type { PlanFeatures, PlanLimits } from "@/db/schema";
import { gridCard, SOLUTIONS, type CardLine } from "@/modules/billing/grid";
import type { LaunchOfferView } from "@/modules/billing/launch-offers";
import {
  monthlyEquivalentCents,
  yearlyPriceCents,
  yearlySavingCents,
  type BillingInterval,
} from "@/modules/billing/yearly";
import { ArrowLine, CheckLine, CrownLine, DashLine, DiamondLine, LeafLine, TabletLine } from "./line-icons";

type CardPlan = {
  id: string;
  code: string;
  name: LocalizedText;
  description: LocalizedText | null;
  priceCents: number;
  features: PlanFeatures;
  limits: PlanLimits;
};

const ICONS = [LeafLine, CrownLine, DiamondLine];

/**
 * Cartes des packs (Basic, Pro, Business) : nom, prix, description, ce que
 * le pack ajoute au précédent, ce qui n'est pas inclus, bouton et conditions.
 * Tout vient des réglages des packs (gridCard) ; le pack du milieu, le plus
 * populaire, est mis en valeur sur fond sombre ; le premier, porte d'entrée,
 * porte un filet d'accent. Une offre de lancement ouverte
 * (tablette) s'affiche sur son pack avec le nombre réel de places restantes.
 */
export async function PlanCards({
  plans,
  locale,
  soon,
  display,
  commitmentMonths,
  offers,
  yearly,
}: {
  plans: CardPlan[];
  locale: Locale;
  soon: string[];
  display: string;
  commitmentMonths: number;
  offers: LaunchOfferView[];
  /** Paiement à l'année proposé, et ses mois offerts (réglages). */
  yearly: { enabled: boolean; freeMonths: number };
}) {
  const t = await getTranslations("home.plans");
  const tGrid = await getTranslations("home.grid");
  const soonSet = new Set(soon);
  const money = (cents: number) => formatMoney(cents, "EUR", locale);
  const nameOf = (code: string | null) =>
    pickLocalized(plans.find((plan) => plan.code === code)?.name ?? null, locale);
  const text = (line: CardLine) => {
    const base = `rows.${line.key}` as "rows.photos";
    if (line.count === null && tGrid.has(`${base}.cardUnlimited` as "rows.photos.cardUnlimited"))
      return tGrid(`${base}.cardUnlimited` as "rows.photos.cardUnlimited");
    return tGrid(`${base}.card` as "rows.photos.card", { count: line.count ?? 0 });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-3 lg:items-stretch lg:gap-6">
      {plans.map((plan, index) => {
        // Pack mis en avant (« Le plus populaire ») : celui du milieu dans une grille de trois, sinon le dernier.
        const featured =
          plans.length >= 3
            ? index === Math.floor(plans.length / 2)
            : plans.length > 1 && index === plans.length - 1;
        // Premier pack : porte d'entrée, mise en valeur légère (filet d'accent, halo, étiquette).
        const entry = plans.length > 1 && index === 0;
        const Icon = ICONS[Math.min(index, ICONS.length - 1)];
        const name = pickLocalized(plan.name, locale);
        const card = gridCard(plan, plans, soonSet);
        const paid = plan.priceCents > 0;
        const offer = offers.find((item) => item.planCode === plan.code && item.open);
        // « Démarrer » mène à la commande (paiement Stripe) ; tant que la vente en ligne est
        // fermée (pages légales non publiées), la page de commande propose d'être rappelé.
        const withYearly = paid && yearly.enabled;
        const yearlyCents = yearlyPriceCents(plan.priceCents, yearly.freeMonths);
        const hrefFor = (billing: BillingInterval) => ({
          pathname: "/commander" as const,
          query: billing === "year" ? { pack: plan.code, billing } : { pack: plan.code },
        });
        const muted = featured ? "text-[#aab3c7]" : "text-ink-soft";
        const strong = featured ? "text-white" : "text-night";

        const line = (item: CardLine, key: string) => (
          <li key={key} data-only={item.solution ?? undefined} className="flex items-start gap-2.5">
            <CheckLine
              className={`mt-[3px] size-4 flex-none ${featured ? "text-champagne" : "text-accent"}`}
            />
            <span>
              {text(item)}
              {item.soon && (
                <span
                  className={`ml-1.5 inline-block rounded-full px-1.5 py-px align-[1px] text-[0.66rem] font-medium ${
                    featured ? "bg-white/10 text-champagne" : "bg-mist-50 text-ink-soft"
                  }`}
                >
                  {t("soonTag")}
                </span>
              )}
            </span>
          </li>
        );

        return (
          <article
            key={plan.id}
            data-plan={plan.code}
            className={`relative flex flex-col rounded-[1.4rem] p-6 transition duration-300 motion-reduce:transition-none lg:p-7 ${
              featured
                ? "bg-deep text-[#d5dbe8] shadow-[0_30px_60px_-28px_rgba(18,26,44,.75)] ring-1 ring-champagne/40 max-lg:order-first"
                : "border border-hairline bg-white shadow-[0_1px_2px_rgba(15,24,48,.04)] hover:-translate-y-1 hover:shadow-[0_24px_44px_-30px_rgba(15,24,48,.35)]"
            }`}
          >
            {entry && (
              <>
                {/* Filet et halo de l'accent de la solution, discrets. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-36 rounded-t-[1.4rem] bg-gradient-to-b from-accent-soft to-transparent"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-t-[1.4rem] bg-accent"
                />
                <p className="absolute right-5 top-0 -translate-y-1/2 rounded-full border border-accent-line bg-white px-3 py-1 text-[0.72rem] font-medium tracking-[0.02em] text-accent-strong">
                  {t("entryTag")}
                </p>
              </>
            )}
            {featured && (
              <>
                {/* Reflet champagne discret en haut de la carte. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-40 rounded-t-[1.4rem] bg-gradient-to-b from-champagne/10 to-transparent"
                />
                <p className="absolute right-5 top-0 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#c9a96a] to-[#e4cfa2] px-3 py-1 text-[0.72rem] font-medium tracking-[0.02em] text-deep">
                  {t("recommended")}
                </p>
              </>
            )}
            <div className="relative flex items-center gap-3">
              <span
                className={`flex size-11 items-center justify-center rounded-full ${
                  featured
                    ? "bg-champagne/15 text-champagne"
                    : entry
                      ? "bg-accent text-white"
                      : "bg-accent-soft text-accent"
                }`}
              >
                <Icon className="size-[22px]" />
              </span>
              <div>
                <h3 className={`font-display text-[1.3rem] font-semibold tracking-[-0.015em] ${strong}`}>
                  {name}
                </h3>
                {plan.description && (
                  <p className={`text-[0.85rem] leading-snug ${muted}`}>
                    {pickLocalized(plan.description, locale)}
                  </p>
                )}
              </div>
            </div>

            <div className="relative mt-6 min-h-[4.6rem]">
              <p data-billing-only={withYearly ? "month" : undefined} className="flex items-baseline gap-2">
                <span
                  className={`font-display text-[2.6rem] font-semibold leading-none tracking-[-0.03em] ${strong}`}
                >
                  {money(plan.priceCents)}
                </span>
                <span className={`text-[0.9rem] ${muted}`}>
                  {paid ? t("perMonth", { display }) : t("freeSuffix")}
                </span>
              </p>
              {withYearly && (
                <div data-billing-only="year">
                  <p className="flex items-baseline gap-2">
                    <span
                      className={`font-display text-[2.6rem] font-semibold leading-none tracking-[-0.03em] ${strong}`}
                    >
                      {money(yearlyCents)}
                    </span>
                    <span className={`text-[0.9rem] ${muted}`}>{t("perYear", { display })}</span>
                  </p>
                  <p className={`mt-1.5 text-[0.82rem] ${muted}`}>
                    {t("yearlyDetail", {
                      monthly: money(monthlyEquivalentCents(yearlyCents)),
                      display,
                      months: yearly.freeMonths,
                    })}
                    {yearly.freeMonths > 0 && (
                      <span
                        className={`ml-2 inline-block rounded-full px-2 py-px text-[0.72rem] font-medium ${
                          featured ? "bg-champagne/15 text-champagne" : "bg-accent-soft text-accent-strong"
                        }`}
                      >
                        {t("yearlySaving", {
                          amount: money(yearlySavingCents(plan.priceCents, yearly.freeMonths)),
                        })}
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>

            <ul
              className={`relative mt-6 flex flex-col gap-2.5 border-t pt-5 text-[0.92rem] leading-snug ${featured ? "border-white/10" : "border-hairline"}`}
            >
              {card.previous && (
                <li className={`flex items-start gap-2.5 font-medium ${strong}`}>
                  <CheckLine
                    className={`mt-[3px] size-4 flex-none ${featured ? "text-champagne" : "text-accent"}`}
                  />
                  {t("everythingIn", { plan: nameOf(card.previous) })}
                </li>
              )}
              {card.included.map((item, i) => line(item, `i${i}`))}
            </ul>

            {/* Fonctions annoncées : à part, en plus petit, jamais présentées comme disponibles. */}
            {SOLUTIONS.map((solution) => {
              // Une version par solution : seules les fonctions qui la concernent y figurent.
              const items = card.upcoming.filter((item) => !item.solution || item.solution === solution);
              return items.length > 0 ? (
                <div key={solution} data-only={solution} className="relative mt-5">
                  <p
                    className={`mb-1.5 text-[0.75rem] font-medium uppercase tracking-[0.06em] ${featured ? "text-champagne" : "text-accent-strong"}`}
                  >
                    {t("upcoming")}
                  </p>
                  <p className={`text-[0.84rem] leading-relaxed ${muted}`}>
                    {items.map((item) => text(item)).join(" · ")}
                  </p>
                </div>
              ) : null;
            })}

            {card.missing.length > 0 && (
              <div className="relative mt-5">
                <p className={`mb-1.5 text-[0.75rem] font-medium uppercase tracking-[0.06em] ${muted}`}>
                  {t("notIncluded")}
                </p>
                <ul className={`flex flex-col gap-1.5 text-[0.85rem] ${muted}`}>
                  {card.missing.map((item, i) => (
                    <li
                      key={`m${i}`}
                      data-only={item.solution ?? undefined}
                      className="flex items-start gap-2.5"
                    >
                      <DashLine className="mt-[3px] size-4 flex-none opacity-70" />
                      <span>{tGrid(`rows.${item.key}.label` as "rows.photos.label")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {offer && (
              <div
                className={`relative mt-6 flex items-center gap-3 rounded-xl border p-3.5 ${featured ? "border-champagne/30 bg-white/[0.04]" : "border-accent-line bg-accent-soft/60"}`}
              >
                <span
                  className={`flex size-11 flex-none items-center justify-center rounded-lg ${featured ? "bg-champagne/15 text-champagne" : "bg-white text-accent"}`}
                >
                  <TabletLine className="size-6" />
                </span>
                <div className="min-w-0 text-[0.82rem] leading-snug">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={`font-medium ${strong}`}>{pickLocalized(offer.title, locale)}</span>
                    <span
                      className={`rounded-full px-2 py-px text-[0.68rem] ${featured ? "bg-champagne/15 text-champagne" : "bg-white text-accent-strong"}`}
                    >
                      {t("tablet.badge")}
                    </span>
                  </p>
                </div>
              </div>
            )}

            <div className="relative mt-auto pt-6">
              <Link
                data-billing-only={withYearly ? "month" : undefined}
                href={hrefFor("month")}
                className={`group flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-[0.95rem] font-medium transition duration-200 motion-reduce:transition-none ${
                  featured
                    ? "bg-gradient-to-r from-[#c9a96a] to-[#e4cfa2] text-deep hover:brightness-105"
                    : paid
                      ? "bg-accent text-white hover:bg-accent-strong"
                      : "border border-hairline bg-white text-night hover:border-accent-line hover:text-accent-strong"
                }`}
              >
                {t("start")}
                <ArrowLine className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              {withYearly && (
                <Link
                  data-billing-only="year"
                  href={hrefFor("year")}
                  className={`group flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-[0.95rem] font-medium transition duration-200 motion-reduce:transition-none ${
                    featured
                      ? "bg-gradient-to-r from-[#c9a96a] to-[#e4cfa2] text-deep hover:brightness-105"
                      : paid
                        ? "bg-accent text-white hover:bg-accent-strong"
                        : "border border-hairline bg-white text-night hover:border-accent-line hover:text-accent-strong"
                  }`}
                >
                  {t("start")}
                  <ArrowLine className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              )}
              <p
                data-billing-only={withYearly ? "month" : undefined}
                className={`mt-3 text-center text-[0.76rem] leading-snug ${muted}`}
              >
                {paid ? t("contractPaid", { months: commitmentMonths, display }) : t("contractFree")}
              </p>
              {withYearly && (
                <p
                  data-billing-only="year"
                  className={`mt-3 text-center text-[0.76rem] leading-snug ${muted}`}
                >
                  {t("contractYearly", { display })}
                </p>
              )}
              {offer && (
                <details className={`group mt-2 text-center text-[0.74rem] leading-snug ${muted}`}>
                  <summary
                    className={`inline-flex min-h-9 cursor-pointer list-none items-center underline underline-offset-2 [&::-webkit-details-marker]:hidden ${featured ? "hover:text-champagne" : "hover:text-accent-strong"}`}
                  >
                    {t("tablet.conditions")}
                  </summary>
                  <p className="mt-1 text-left">{pickLocalized(offer.conditions, locale)}</p>
                </details>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
