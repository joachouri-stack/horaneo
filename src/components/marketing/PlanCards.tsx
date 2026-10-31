import { getTranslations } from "next-intl/server";
import { PLATFORM_CURRENCY } from "@/config/billing";
import { Link } from "@/i18n/navigation";
import { pickLocalized, type Locale, type LocalizedText } from "@/i18n/locales";
import { formatMoney, moneyParts } from "@/lib/format";
import type { PlanFeatures, PlanLimits } from "@/db/schema";
import { gridCard, SOLUTIONS, type CardLine } from "@/modules/billing/grid";
import type { LaunchOfferView } from "@/modules/billing/launch-offers";
import {
  monthlyEquivalentCents,
  yearlyPriceCents,
  yearlySavingCents,
  type BillingInterval,
} from "@/modules/billing/yearly";
import { PlanSpotlight } from "./PlanSpotlight";
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
/** Lignes affichées d'emblée sur chaque carte ; les suivantes se déplient. */
const VISIBLE_LINES = 9;
/** Fonctions annoncées montrées d'emblée ; les suivantes se déplient. */
const UPCOMING_SHOWN = 4;
/** Bouton du premier pack : dégradé de l'accent avec reflet. */
const ENTRY_BUTTON =
  "hn-shine bg-gradient-to-r from-accent to-accent-strong text-white shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_14px_30px_-14px_var(--color-accent)] hover:brightness-110";
/** Bouton du pack le plus complet : champagne sur fond sombre. */
const TOP_BUTTON =
  "hn-shine bg-deep text-champagne shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_14px_30px_-14px_rgba(18,26,44,.7)] hover:bg-[#1b2540]";

/**
 * Cartes des packs (Starter, Pro, Business) : nom, prix, description, ce que
 * le pack ajoute au précédent, ce qui n'est pas inclus, bouton et conditions.
 * Tout vient des réglages des packs (gridCard) ; le pack du milieu, le plus
 * populaire, est mis en valeur sur fond sombre ; le premier, porte d'entrée,
 * porte un filet d'accent et reste en tête sur téléphone ; le dernier, le plus
 * complet, est une carte nacrée à filet champagne. Une offre de lancement ouverte
 * (tablette) s'affiche sur son pack avec le nombre réel de places restantes.
 */
export async function PlanCards({
  plans,
  locale,
  soon,
  display,
  commitmentMonths,
  noCommitment = true,
  offers,
  yearly,
}: {
  plans: CardPlan[];
  locale: Locale;
  soon: string[];
  display: string;
  commitmentMonths: number;
  /** Formule sans engagement proposée à côté de l'engagement (réglage admin). */
  noCommitment?: boolean;
  offers: LaunchOfferView[];
  /** Paiement à l'année proposé, et ses mois offerts (réglages). */
  yearly: { enabled: boolean; freeMonths: number };
}) {
  const t = await getTranslations("home.plans");
  const tGrid = await getTranslations("home.grid");
  const soonSet = new Set(soon);
  const money = (cents: number) => formatMoney(cents, PLATFORM_CURRENCY, locale);
  // Prix des cartes : partie entière en grand, centimes et devise en petit.
  const bigPrice = (cents: number, gold: boolean, className: string, tailClass = "") => {
    const { lead, tail } = moneyParts(cents, PLATFORM_CURRENCY, locale);
    return (
      <span
        className={`font-display font-semibold leading-none tracking-[-0.035em] tabular-nums ${gold ? "hn-gold" : className}`}
      >
        <span className="text-mk-price">{lead}</span>
        <span className={`text-[1.5rem] tracking-[-0.02em] ${tailClass}`}>{tail}</span>
      </span>
    );
  };
  const nameOf = (code: string | null) =>
    pickLocalized(plans.find((plan) => plan.code === code)?.name ?? null, locale);
  const text = (line: CardLine) => {
    const base = `rows.${line.key}` as "rows.photos";
    if (line.count === null && tGrid.has(`${base}.cardUnlimited` as "rows.photos.cardUnlimited"))
      return tGrid(`${base}.cardUnlimited` as "rows.photos.cardUnlimited");
    return tGrid(`${base}.card` as "rows.photos.card", { count: line.count ?? 0 });
  };

  return (
    <PlanSpotlight className="grid gap-5 md:max-lg:mx-auto md:max-lg:max-w-[36rem] lg:grid-cols-3 lg:items-stretch lg:gap-6">
      {plans.map((plan, index) => {
        // Pack mis en avant (« Le plus populaire ») : celui du milieu dans une grille de trois, sinon le dernier.
        const featured =
          plans.length >= 3
            ? index === Math.floor(plans.length / 2)
            : plans.length > 1 && index === plans.length - 1;
        // Premier pack : porte d'entrée, mise en valeur légère (filet d'accent, halo, étiquette).
        const entry = plans.length > 1 && index === 0;
        // Dernier pack d'une grille de trois : le plus complet, carte claire nacrée à filet champagne.
        const top = plans.length >= 3 && index === plans.length - 1;
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
        const check = (
          <span
            className={`mt-[1px] flex size-[18px] flex-none items-center justify-center rounded-full ${
              featured
                ? "bg-champagne/20 text-champagne"
                : entry
                  ? "bg-accent text-white"
                  : top
                    ? "bg-[#efdfbd] text-copper"
                    : "bg-accent-soft text-accent"
            }`}
          >
            <CheckLine className="size-3" />
          </span>
        );
        const muted = featured ? "text-[#aab3c7]" : "text-ink-soft";
        const strong = featured ? "text-white" : "text-night";
        // Couleur des petits titres et liens de la carte.
        const tint = featured ? "text-champagne" : top ? "text-copper" : "text-accent-strong";

        const line = (item: CardLine, key: string) => (
          <li key={key} data-only={item.solution ?? undefined} className="flex items-start gap-2.5">
            {check}
            <span>
              {text(item)}
              {item.soon && (
                <span
                  className={`ml-1.5 inline-block rounded-full px-1.5 py-px align-[1px] text-[0.875rem] font-medium ${
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
            data-reveal
            className={`hn-spot relative flex flex-col rounded-[1.4rem] p-6 transition duration-300 motion-reduce:transition-none lg:p-7 ${
              featured
                ? "bg-[radial-gradient(120%_60%_at_50%_-8%,#26324f_0%,#121a2c_55%,#0b1120_100%)] text-[#d5dbe8] shadow-[0_40px_80px_-36px_rgba(18,26,44,.85),0_0_0_1px_rgba(217,192,142,.08)] [--spot:rgba(217,192,142,.11)] md:max-lg:order-first lg:-my-3 lg:py-10"
                : entry
                  ? "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-accent)_7%,white)_0%,#fff_42%)] shadow-[0_1px_2px_rgba(15,24,48,.04),0_30px_60px_-36px_color-mix(in_srgb,var(--color-accent)_60%,transparent)] [--spot:color-mix(in_srgb,var(--color-accent)_10%,transparent)] hover:-translate-y-1 hover:shadow-[0_36px_70px_-34px_color-mix(in_srgb,var(--color-accent)_70%,transparent)]"
                  : top
                    ? "bg-[linear-gradient(180deg,#fffdf8_0%,#fbf6ec_100%)] shadow-[0_1px_2px_rgba(15,24,48,.04),0_30px_60px_-36px_rgba(148,102,54,.45)] [--spot:rgba(217,192,142,.16)] hover:-translate-y-1 hover:shadow-[0_36px_70px_-34px_rgba(148,102,54,.55)]"
                    : "border border-hairline bg-white/90 shadow-[0_1px_2px_rgba(15,24,48,.04),0_12px_32px_-24px_rgba(15,24,48,.18)] backdrop-blur-sm [--spot:color-mix(in_srgb,var(--color-accent)_9%,transparent)] hover:-translate-y-1 hover:shadow-[0_28px_50px_-30px_rgba(15,24,48,.35)]"
            }`}
          >
            {entry && (
              <>
                {/* Filet complet et halo de l'accent de la solution. */}
                <span aria-hidden="true" className="hn-edge hn-edge-full" />
                <p className="absolute right-5 top-0 -translate-y-1/2 rounded-full bg-gradient-to-r from-accent to-accent-strong px-3 py-1 text-[0.875rem] font-medium tracking-[0.02em] text-white shadow-[0_6px_16px_-8px_var(--color-accent)]">
                  {t("entryTag")}
                </p>
              </>
            )}
            {top && (
              <>
                {/* Filet champagne, reflet nacré en haut de la carte. */}
                <span aria-hidden="true" className="hn-edge hn-edge-gold" />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-36 rounded-t-[1.4rem] bg-gradient-to-b from-champagne-soft to-transparent"
                />
                <p className="absolute right-5 top-0 -translate-y-1/2 rounded-full bg-deep px-3 py-1 text-[0.875rem] font-medium tracking-[0.02em] text-champagne shadow-[0_6px_16px_-8px_rgba(18,26,44,.6)]">
                  {t("completeTag")}
                </p>
              </>
            )}
            {featured && (
              <>
                {/* Liseré champagne qui tourne lentement, grain léger, reflet en haut de la carte. */}
                <span aria-hidden="true" className="hn-ring" />
                <span
                  aria-hidden="true"
                  className="hn-grain pointer-events-none absolute inset-0 rounded-[1.4rem]"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-40 rounded-t-[1.4rem] bg-gradient-to-b from-champagne/10 to-transparent"
                />
                <p className="absolute right-5 top-0 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#c9a96a] to-[#e4cfa2] px-3 py-1 text-[0.875rem] font-medium tracking-[0.02em] text-deep">
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
                      ? "bg-gradient-to-br from-accent to-accent-strong text-white shadow-[0_8px_18px_-8px_var(--color-accent)] ring-4 ring-accent-soft"
                      : top
                        ? "bg-gradient-to-br from-[#f6e9c9] to-[#e4cfa2] text-copper shadow-[0_8px_18px_-8px_rgba(148,102,54,.5)] ring-4 ring-champagne-soft"
                        : "bg-accent-soft text-accent"
                }`}
              >
                <Icon className="size-[22px]" />
              </span>
              <div>
                <h3 className={`font-display text-mk-card font-semibold tracking-[-0.015em] ${strong}`}>
                  {name}
                </h3>
                {plan.description && (
                  <p className={`text-[0.9375rem] leading-snug ${muted}`}>
                    {pickLocalized(plan.description, locale)}
                  </p>
                )}
              </div>
            </div>

            <div className={`relative mt-6 ${withYearly ? "lg:min-h-[4.6rem]" : ""}`}>
              <p data-billing-only={withYearly ? "month" : undefined} className="flex items-baseline gap-2">
                {bigPrice(
                  plan.priceCents,
                  featured,
                  strong,
                  entry ? "text-accent" : top ? "text-copper" : "",
                )}
                <span className={`text-[1.0625rem] ${muted}`}>
                  {paid ? t("perMonth", { display }) : t("freeSuffix")}
                </span>
              </p>
              {withYearly && (
                <div data-billing-only="year">
                  <p className="flex items-baseline gap-2">
                    {bigPrice(
                      yearlyCents,
                      featured,
                      strong,
                      entry ? "text-accent" : top ? "text-copper" : "",
                    )}
                    <span className={`text-[1.0625rem] ${muted}`}>{t("perYear", { display })}</span>
                  </p>
                  <p className={`mt-1.5 text-[0.9375rem] ${muted}`}>
                    {t("yearlyDetail", {
                      monthly: money(monthlyEquivalentCents(yearlyCents)),
                      display,
                      months: yearly.freeMonths,
                    })}
                    {yearly.freeMonths > 0 && (
                      <span
                        className={`ml-2 inline-block rounded-full px-2 py-px text-[0.875rem] font-medium ${
                          featured
                            ? "bg-champagne/15 text-champagne"
                            : top
                              ? "bg-champagne-soft text-copper"
                              : "bg-accent-soft text-accent-strong"
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
              className={`relative mt-6 flex flex-col gap-2.5 border-t pt-5 text-[1.0625rem] leading-snug ${featured ? "border-white/10" : top ? "border-champagne/30" : "border-hairline"}`}
            >
              {card.previous && (
                <li className={`flex items-start gap-2.5 font-medium ${strong}`}>
                  {check}
                  {t("everythingIn", { plan: nameOf(card.previous) })}
                </li>
              )}
              {card.included.slice(0, VISIBLE_LINES).map((item, i) => line(item, `i${i}`))}
            </ul>
            {/* Listes longues : le reste se déplie, pour garder des cartes lisibles d'un coup d'œil. */}
            {card.included.length > VISIBLE_LINES && (
              <details className="group/more relative mt-2.5 text-[1.0625rem] leading-snug">
                <summary
                  className={`inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[0.9375rem] font-medium underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden ${tint}`}
                >
                  <span className="group-open/more:hidden">{t("showAll")}</span>
                  <span className="hidden group-open/more:inline">{t("showLess")}</span>
                  <ArrowLine className="size-3.5 rotate-90 transition-transform group-open/more:-rotate-90" />
                </summary>
                <ul className="flex flex-col gap-2.5 pt-1">
                  {card.included.slice(VISIBLE_LINES).map((item, i) => line(item, `r${i}`))}
                </ul>
              </details>
            )}

            {/* Fonctions annoncées : à part, en plus petit, jamais présentées comme disponibles. */}
            {SOLUTIONS.map((solution) => {
              // Une version par solution : seules les fonctions qui la concernent y figurent.
              const items = card.upcoming.filter((item) => !item.solution || item.solution === solution);
              return items.length > 0 ? (
                <div key={solution} data-only={solution} className="relative mt-5">
                  <p className={`mb-1.5 text-[0.875rem] font-medium uppercase tracking-[0.06em] ${tint}`}>
                    {t("upcoming")}
                  </p>
                  <p className={`text-[0.9375rem] leading-relaxed ${muted}`}>
                    {items
                      .slice(0, UPCOMING_SHOWN)
                      .map((item) => text(item))
                      .join(" · ")}
                  </p>
                  {/* Longue liste : les premières seulement, le reste se déplie. */}
                  {items.length > UPCOMING_SHOWN && (
                    <details className={`group/soon text-[0.9375rem] leading-relaxed ${muted}`}>
                      <summary
                        className={`inline-flex min-h-11 cursor-pointer list-none items-center font-medium underline-offset-4 hover:underline group-open/soon:hidden [&::-webkit-details-marker]:hidden ${tint}`}
                      >
                        {t("upcomingMore", { count: items.length - UPCOMING_SHOWN })}
                      </summary>
                      <p className="mt-1">
                        {items
                          .slice(UPCOMING_SHOWN)
                          .map((item) => text(item))
                          .join(" · ")}
                      </p>
                    </details>
                  )}
                </div>
              ) : null;
            })}

            {card.missing.length > 0 && (
              <div className="relative mt-5">
                <p className={`mb-1.5 text-[0.875rem] font-medium uppercase tracking-[0.06em] ${muted}`}>
                  {t("notIncluded")}
                </p>
                <ul className={`flex flex-col gap-1.5 text-[0.9375rem] ${muted}`}>
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
                className={`relative mt-6 flex items-center gap-3 rounded-xl border p-3.5 ${featured ? "border-champagne/30 bg-white/[0.04]" : top ? "border-champagne/40 bg-champagne-soft/60" : "border-accent-line bg-accent-soft/60"}`}
              >
                <span
                  className={`flex size-11 flex-none items-center justify-center rounded-lg ${featured ? "bg-champagne/15 text-champagne" : top ? "bg-white text-copper" : "bg-white text-accent"}`}
                >
                  <TabletLine className="size-6" />
                </span>
                <div className="min-w-0 text-[0.9375rem] leading-snug">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={`font-medium ${strong}`}>{pickLocalized(offer.title, locale)}</span>
                    <span
                      className={`rounded-full px-2 py-px text-[0.875rem] ${featured ? "bg-champagne/15 text-champagne" : top ? "bg-white text-copper" : "bg-white text-accent-strong"}`}
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
                aria-label={t("choose", { plan: name })}
                className={`group flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-[1.0625rem] font-medium transition duration-200 motion-reduce:transition-none ${
                  featured
                    ? "hn-shine bg-gradient-to-r from-[#c9a96a] via-[#e4cfa2] to-[#d2b47c] text-deep focus-visible:outline-white shadow-[0_12px_30px_-14px_rgba(217,192,142,.7)] hover:brightness-105"
                    : top && paid
                      ? TOP_BUTTON
                      : entry && paid
                        ? ENTRY_BUTTON
                        : paid
                          ? "bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_12px_26px_-16px_var(--color-accent)] hover:bg-accent-strong"
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
                  aria-label={t("choose", { plan: name })}
                  className={`group flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-[1.0625rem] font-medium transition duration-200 motion-reduce:transition-none ${
                    featured
                      ? "hn-shine bg-gradient-to-r from-[#c9a96a] via-[#e4cfa2] to-[#d2b47c] text-deep focus-visible:outline-white shadow-[0_12px_30px_-14px_rgba(217,192,142,.7)] hover:brightness-105"
                      : top && paid
                        ? TOP_BUTTON
                        : entry && paid
                          ? ENTRY_BUTTON
                          : paid
                            ? "bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_12px_26px_-16px_var(--color-accent)] hover:bg-accent-strong"
                            : "border border-hairline bg-white text-night hover:border-accent-line hover:text-accent-strong"
                  }`}
                >
                  {t("start")}
                  <ArrowLine className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              )}
              <p
                data-billing-only={withYearly ? "month" : undefined}
                className={`mt-3 text-center text-[0.875rem] leading-snug ${muted}`}
              >
                {paid
                  ? t("contractPaid", {
                      months: commitmentMonths,
                      display,
                      choice: noCommitment ? "yes" : "no",
                    })
                  : t("contractFree")}
              </p>
              {withYearly && (
                <p
                  data-billing-only="year"
                  className={`mt-3 text-center text-[0.875rem] leading-snug ${muted}`}
                >
                  {t("contractYearly", { display })}
                </p>
              )}
              {offer && (
                <details className={`group mt-2 text-center text-[0.875rem] leading-snug ${muted}`}>
                  <summary
                    className={`inline-flex min-h-11 cursor-pointer list-none items-center underline underline-offset-2 [&::-webkit-details-marker]:hidden ${featured ? "hover:text-champagne" : "hover:text-accent-strong"}`}
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
    </PlanSpotlight>
  );
}
