import { getTranslations } from "next-intl/server";
import type { PlanFeatures, PlanLimits } from "@/db/schema";
import { Link } from "@/i18n/navigation";
import { pickLocalized, type Locale, type LocalizedText } from "@/i18n/locales";
import {
  planItems,
  planTiles,
  splitPlans,
  type ShowcaseItem,
  type ShowcaseTile,
} from "@/modules/billing/showcase";
import { ArrowIcon, CheckIcon, DashIcon, PLAN_ICONS, SparkleIcon, StarIcon } from "./icons";
import { PlanFlip } from "./PlanFlip";

/** Fonctions affichées d'emblée sur chaque carte ; les suivantes se déplient. */
const VISIBLE_ITEMS = 6;

type Plan = {
  id: string;
  code: string;
  name: LocalizedText;
  description: LocalizedText | null;
  priceCents: number;
  /** Frais de création propres au pack (null : réglage général). */
  setupFeeCents: number | null;
  limits: PlanLimits;
  features: PlanFeatures;
};

/**
 * Cartes des packs : prix, trois chiffres clés, bouton, ce qui est inclus.
 * Tout vient de la base ; le dernier pack de chaque côté est mis en avant.
 * Les packs « site seul » sont au dos des packs avec réservation : un
 * interrupteur retourne toutes les cartes.
 */
export async function PlanCards({ plans, locale }: { plans: Plan[]; locale: Locale }) {
  const t = await getTranslations("home.plans");
  const money = (cents: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);

  const tile = (item: ShowcaseTile) => {
    switch (item.key) {
      case "bookings":
        return {
          value: item.count === null ? t("tiles.unlimited") : String(item.count),
          label: t("tiles.bookings", { unlimited: item.count === null ? "yes" : "no" }),
        };
      case "members":
        return {
          value: item.count === null ? t("tiles.unlimited") : String(item.count),
          label: t("tiles.members", { count: item.count ?? 2 }),
        };
      case "sms":
        return { value: String(item.count), label: t("tiles.sms") };
      case "emailReminders":
        return { value: t("tiles.emailValue"), label: t("tiles.emailLabel") };
      case "pages":
        return {
          value: item.fullSite ? t("tiles.fullSiteValue") : t("tiles.onePageValue"),
          label: item.fullSite ? t("tiles.fullSiteLabel") : t("tiles.onePageLabel"),
        };
      case "photos":
        return {
          value: item.count === null ? t("tiles.unlimited") : String(item.count),
          label: t("tiles.photos"),
        };
      case "domain":
        return { value: t("tiles.domainValue"), label: t("tiles.domainLabel") };
    }
  };
  const { booking, siteOnly } = splitPlans(plans);
  const itemText = (group: Plan[], item: ShowcaseItem) =>
    item.kind === "everythingIn"
      ? t("items.everythingIn", { plan: pickLocalized(group[item.planIndex].name, locale) })
      : item.kind === "soon"
        ? t(`soon.${item.key}`)
        : t(`items.${item.key}`, item.kind === "included" ? item.values : undefined);

  const card = (group: Plan[], index: number) => {
    const plan = group[index];
    const featured = group.length > 1 && index === group.length - 1;
    const Icon = PLAN_ICONS[Math.min(index, PLAN_ICONS.length - 1)];
    const name = pickLocalized(plan.name, locale);
    const description = pickLocalized(plan.description, locale);
    const items = planItems(group, index);
    const setupFee = plan.setupFeeCents ?? 0;
    // Au dos : le pack avec réservation du même rang, pour l'ajouter plus tard.
    const upgrade = group === siteOnly ? booking[index] : undefined;
    const muted = featured ? "text-[#c9d0de]" : "text-stone";
    const strong = featured ? "text-white" : "text-night";
    const accent = featured ? "text-salmon" : "text-navy";

    const line = (item: ShowcaseItem, itemIndex: number) => {
      const missing = item.kind === "missing";
      const soon = item.kind === "soon";
      return (
        <li key={itemIndex} className={`flex items-start gap-3 ${missing || soon ? muted : ""}`}>
          <span
            className={`mt-[3px] flex size-[1.15rem] flex-none items-center justify-center rounded-full ${
              missing
                ? featured
                  ? "bg-[#2c3b5e] text-[#8f9bb5]"
                  : "bg-sand text-[#b5afa4]"
                : featured
                  ? "bg-[#33456b] text-salmon"
                  : "bg-mist text-navy"
            }`}
          >
            {missing ? (
              <DashIcon className="size-3" />
            ) : soon ? (
              <SparkleIcon className="size-3" />
            ) : (
              <CheckIcon className="size-3" />
            )}
          </span>
          <span className={soon ? "italic" : ""}>
            {!soon && <span className="sr-only">{missing ? t("missing") : t("included")} </span>}
            {itemText(group, item)}
          </span>
        </li>
      );
    };
    const shown = items.slice(0, VISIBLE_ITEMS);
    const more = items.slice(VISIBLE_ITEMS);
    const list = "relative flex flex-col gap-3 text-[0.93rem] leading-snug";

    return (
      <article
        key={plan.id}
        className={`group/card relative flex w-full flex-col overflow-hidden rounded-[1.75rem] border-2 p-6 transition duration-300 ease-out hover:-translate-y-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0 lg:p-7 ${
          featured
            ? "border-coral bg-navy text-sand shadow-[0_24px_50px_-12px_rgba(27,42,74,.45)] hover:shadow-[0_34px_64px_-12px_rgba(27,42,74,.55)] lg:py-9"
            : "border-line bg-white text-body shadow-[0_1px_0_rgba(22,24,29,.04)] hover:border-navy hover:shadow-[0_28px_56px_-16px_rgba(22,24,29,.22)]"
        }`}
      >
        {/* Décor : un anneau et un disque en partie hors cadre, qui bougent au survol. */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -right-16 -top-16 size-36 rounded-full border-[1.1rem] transition duration-500 ease-out group-hover/card:-translate-x-3 group-hover/card:translate-y-3 motion-reduce:transition-none ${
            featured ? "border-navy-light" : "border-mist"
          }`}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-5 top-5 size-2.5 rounded-full transition duration-500 ease-out group-hover/card:-translate-x-3 group-hover/card:translate-y-3 motion-reduce:transition-none ${
            featured ? "bg-coral" : "bg-mist-strong"
          }`}
        />

        {/* En-tête : icône, nom, accroche */}
        <div className="relative flex items-start gap-3">
          <span
            className={`flex size-10 flex-none items-center justify-center rounded-xl transition duration-300 group-hover/card:-rotate-6 group-hover/card:scale-105 motion-reduce:transition-none ${
              featured ? "bg-coral text-white" : index === 0 ? "bg-sand text-night" : "bg-mist text-navy"
            }`}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3
                className={`font-display text-[1.25rem] font-bold leading-tight tracking-[-0.02em] ${strong}`}
              >
                {name}
              </h3>
              {featured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-coral px-2.5 py-0.5 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[#2a0f0a]">
                  <StarIcon className="size-3" />
                  {t("recommended")}
                </span>
              )}
            </div>
            {description && <p className={`mt-0.5 text-[0.9rem] leading-snug ${muted}`}>{description}</p>}
          </div>
        </div>

        {/* Prix */}
        <div className="relative mt-6">
          <p className="flex items-baseline gap-1.5">
            <span
              className={`font-display text-[2.15rem] font-bold leading-none tracking-[-0.03em] lg:text-[2.4rem] ${strong}`}
            >
              {money(plan.priceCents)}
            </span>
            <span className={`text-[0.9rem] ${muted}`}>
              {plan.priceCents > 0 ? t("perMonthShort") : t("freeForever")}
            </span>
          </p>
          {setupFee > 0 && (
            <p className={`mt-1.5 text-[0.82rem] font-medium ${accent}`}>
              {t("setupFeeBadge", { amount: money(setupFee) })}
            </p>
          )}
        </div>

        {/* Chiffres clés : une bande fine, trois colonnes */}
        <dl
          className={`relative mt-5 grid grid-cols-3 divide-x rounded-2xl border ${
            featured ? "divide-[#34466b] border-[#34466b]" : "divide-line border-line"
          }`}
        >
          {planTiles(plan).map((item) => {
            const { value, label } = tile(item);
            return (
              <div key={item.key} className="flex flex-col-reverse items-center px-1.5 py-2.5 text-center">
                <dt className={`text-[0.7rem] leading-tight ${muted}`}>{label}</dt>
                <dd className={`text-[0.95rem] font-semibold leading-tight ${strong}`}>{value}</dd>
              </div>
            );
          })}
        </dl>

        <Link
          href={{ pathname: "/commander", query: { pack: plan.code } }}
          className={`group/cta relative mt-5 flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-3 text-[0.98rem] font-semibold transition duration-200 hover:-translate-y-0.5 motion-reduce:transition-none ${
            featured
              ? "bg-brick text-white hover:shadow-[0_12px_26px_rgba(212,64,47,.38)]"
              : "bg-mist text-navy hover:bg-navy hover:text-white hover:shadow-[0_12px_26px_rgba(27,42,74,.25)]"
          }`}
        >
          {plan.priceCents > 0 ? t("choose", { plan: name }) : t("start")}
          <ArrowIcon className="size-[18px] shrink-0 transition-transform group-hover/cta:translate-x-1" />
        </Link>

        {/* Ce qui est inclus : les principales d'abord, le reste se déplie. */}
        <div className={`relative mt-6 border-t pt-5 ${featured ? "border-[#34466b]" : "border-line"}`}>
          <ul className={list}>{shown.map((item, itemIndex) => line(item, itemIndex))}</ul>
          {more.length > 0 && (
            <details className="group/more relative mt-1">
              <summary
                className={`flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[0.9rem] font-semibold [&::-webkit-details-marker]:hidden ${accent}`}
              >
                <span className="group-open/more:hidden">{t("moreItems", { count: more.length })}</span>
                <span className="hidden group-open/more:inline">{t("lessItems")}</span>
                <ArrowIcon className="size-4 rotate-90 transition-transform group-open/more:-rotate-90" />
              </summary>
              <ul className={`${list} pb-1`}>{more.map((item, i) => line(item, VISIBLE_ITEMS + i))}</ul>
            </details>
          )}
        </div>

        {upgrade && (
          <p
            className={`relative mt-auto flex gap-2.5 rounded-2xl px-4 py-3 text-[0.85rem] font-medium leading-snug ${
              featured ? "bg-navy-light text-white" : "bg-ivory text-night"
            }`}
          >
            <ArrowIcon className={`mt-[2px] size-4 flex-none ${accent}`} />
            {t("addBooking", { plan: pickLocalized(upgrade.name, locale) })}
          </p>
        )}
      </article>
    );
  };

  // Téléphone et tablette : les packs défilent d'un geste (une carte et le bord de la suivante) ;
  // ordinateur : trois colonnes.
  const row =
    "-mx-4 flex snap-x snap-mandatory items-start gap-4 overflow-x-auto scroll-px-4 px-4 py-3 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-3 lg:items-center lg:gap-5 lg:overflow-visible lg:p-0 xl:gap-6 [&::-webkit-scrollbar]:hidden";
  const cell = "flex w-[86%] max-w-[23rem] shrink-0 snap-center sm:w-[55%] lg:block lg:w-auto lg:max-w-none";

  // Aucun pack « site seul » proposé : une simple rangée de cartes.
  if (siteOnly.length === 0) {
    return (
      <div className={row}>
        {booking.map((plan, index) => (
          <div key={plan.id} className={cell}>
            {card(booking, index)}
          </div>
        ))}
      </div>
    );
  }

  const cells = Math.max(booking.length, siteOnly.length);
  return (
    <PlanFlip
      labels={{
        group: t("toggleLabel"),
        booking: t("toggleBooking"),
        site: t("toggleSite"),
        hintBooking: t("toggleHintBooking"),
        hintSite: t("toggleHintSite"),
        dot: t.raw("carouselDot") as string,
      }}
    >
      <div data-carousel className={row}>
        {Array.from({ length: cells }, (_, index) => (
          // Une case, deux faces superposées : la case prend la hauteur de la plus grande.
          <div key={index} className={`${cell} [perspective:2200px]`}>
            <div className="grid w-full items-start transition-transform duration-700 lg:items-center ease-in-out [transform-style:preserve-3d] group-data-[side=site]/plans:[transform:rotateY(180deg)] motion-reduce:transition-none">
              {/* La face cachée devient invisible à mi-retournement : ni lue, ni atteinte au clavier. */}
              <div className="visible flex [grid-area:1/1] [backface-visibility:hidden] lg:block transition-[visibility] delay-300 duration-0 group-data-[side=site]/plans:invisible motion-reduce:delay-0">
                {booking[index] && card(booking, index)}
              </div>
              <div className="invisible flex [grid-area:1/1] [backface-visibility:hidden] lg:block [transform:rotateY(180deg)] transition-[visibility] delay-300 duration-0 group-data-[side=site]/plans:visible motion-reduce:delay-0">
                {siteOnly[index] && card(siteOnly, index)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </PlanFlip>
  );
}
