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
    return (
      <article
        key={plan.id}
        className={`group relative flex flex-col gap-5 overflow-hidden rounded-[1.75rem] px-6 transition duration-200 hover:-translate-y-2 lg:rounded-[2rem] lg:px-7 ${
          featured
            ? "border-2 border-coral bg-navy py-8 text-sand lg:py-10 shadow-[0_30px_60px_rgba(27,42,74,.35)] hover:shadow-[0_34px_64px_rgba(27,42,74,.45)]"
            : "border-2 border-line bg-white py-7 text-body hover:border-coral hover:shadow-[0_28px_56px_rgba(22,24,29,.16)]"
        }`}
      >
        {featured && (
          <>
            <div
              aria-hidden="true"
              className="absolute -right-14 -top-14 size-44 rounded-full bg-navy-light"
            />
            <p className="relative -mb-1.5 inline-flex items-center gap-1.5 self-start rounded-full bg-coral px-4 py-1 text-sm font-semibold text-[#2a0f0a]">
              <StarIcon className="size-3.5" />
              {t("recommended")}
            </p>
          </>
        )}
        <div className="relative flex items-center gap-3.5">
          <span
            className={`flex size-11 flex-none items-center justify-center rounded-2xl lg:size-12 ${
              featured ? "bg-coral text-white" : index === 0 ? "bg-sand text-night" : "bg-blush text-brick"
            }`}
          >
            <Icon className="size-6" />
          </span>
          <div>
            <h3
              className={`text-[1.3rem] font-semibold leading-tight lg:text-[1.4rem] ${featured ? "text-white" : "text-night"}`}
            >
              {name}
            </h3>
            {description && (
              <p className={`text-[0.95rem] ${featured ? "text-[#c9d0de]" : "text-stone"}`}>{description}</p>
            )}
          </div>
        </div>
        <div className="relative">
          <p
            className={`font-display text-[2.8rem] font-bold leading-none tracking-[-0.03em] lg:text-[3.2rem] ${featured ? "text-white" : "text-night"}`}
          >
            {money(plan.priceCents)}{" "}
            <span
              className={`whitespace-nowrap font-sans text-base font-normal tracking-normal ${featured ? "text-[#c9d0de]" : "text-stone"}`}
            >
              {plan.priceCents > 0 ? t("perMonthShort") : t("freeForever")}
            </span>
          </p>
          {setupFee > 0 && (
            <p
              className={`mt-2.5 inline-block rounded-full px-3 py-1 text-[0.85rem] font-semibold ${featured ? "bg-navy-light text-salmon" : "bg-blush text-rust"}`}
            >
              {t("setupFeeBadge", { amount: money(setupFee) })}
            </p>
          )}
        </div>
        <dl className="relative grid grid-cols-3 gap-2">
          {planTiles(plan).map((item) => {
            const { value, label } = tile(item);
            return (
              <div
                key={item.key}
                className={`flex flex-col-reverse rounded-2xl px-2 py-3 text-center transition-transform group-hover:-translate-y-0.5 ${
                  featured ? "bg-navy-light" : "bg-ivory"
                }`}
              >
                <dt className={`text-xs leading-tight ${featured ? "text-[#c9d0de]" : "text-stone"}`}>
                  {label}
                </dt>
                <dd className={`text-[1.05rem] font-semibold ${featured ? "text-white" : "text-night"}`}>
                  {value}
                </dd>
              </div>
            );
          })}
        </dl>
        <Link
          href={{ pathname: "/commander", query: { pack: plan.code } }}
          className={`relative flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 py-3.5 text-[1rem] font-semibold transition hover:-translate-y-0.5 ${
            featured
              ? "bg-brick text-white hover:shadow-[0_12px_26px_rgba(212,64,47,.32)]"
              : "bg-blush text-rust hover:bg-brick hover:text-white"
          }`}
        >
          {plan.priceCents > 0 ? t("choose", { plan: name }) : t("start")}
          <ArrowIcon className="size-[18px] shrink-0 transition-transform group-hover:translate-x-1.5" />
        </Link>
        <ul
          className={`relative flex flex-col gap-2.5 border-t pt-5 text-[0.95rem] ${featured ? "border-[#3a4a6e]" : "border-line"}`}
        >
          {items.map((item, itemIndex) => {
            const missing = item.kind === "missing";
            const soon = item.kind === "soon";
            return (
              <li
                key={itemIndex}
                className={`flex gap-2.5 ${missing || soon ? (featured ? "text-[#c9d0de]" : "text-stone") : ""} ${soon ? "italic" : ""}`}
              >
                {missing ? (
                  <DashIcon className="mt-[3px] size-5 flex-none text-[#b5afa4]" />
                ) : soon ? (
                  <SparkleIcon
                    className={`mt-[3px] size-5 flex-none ${featured ? "text-salmon" : "text-brick"}`}
                  />
                ) : (
                  <CheckIcon
                    className={`mt-[3px] size-5 flex-none ${featured ? "text-salmon" : "text-brick"}`}
                  />
                )}
                <span>
                  {!soon && <span className="sr-only">{missing ? t("missing") : t("included")} </span>}
                  {itemText(group, item)}
                </span>
              </li>
            );
          })}
        </ul>
        {upgrade && (
          <p
            className={`relative -mt-2 flex gap-2.5 font-semibold ${featured ? "text-white" : "text-night"}`}
          >
            <ArrowIcon className={`mt-[3px] size-5 flex-none ${featured ? "text-salmon" : "text-brick"}`} />
            {t("addBooking", { plan: pickLocalized(upgrade.name, locale) })}
          </p>
        )}
      </article>
    );
  };

  // Téléphone et tablette : les packs défilent d'un geste (une carte et le bord de la suivante) ;
  // ordinateur : trois colonnes.
  const row =
    "-mx-4 flex snap-x snap-mandatory items-start gap-4 overflow-x-auto scroll-px-4 px-4 py-3 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-3 lg:items-center lg:gap-6 lg:overflow-visible lg:p-0 [&::-webkit-scrollbar]:hidden";
  const cell = "w-[86%] max-w-[23rem] shrink-0 snap-center sm:w-[55%] lg:w-auto lg:max-w-none";

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
            <div className="grid items-center transition-transform duration-700 ease-in-out [transform-style:preserve-3d] group-data-[side=site]/plans:[transform:rotateY(180deg)] motion-reduce:transition-none">
              {/* La face cachée devient invisible à mi-retournement : ni lue, ni atteinte au clavier. */}
              <div className="visible [grid-area:1/1] [backface-visibility:hidden] transition-[visibility] delay-300 duration-0 group-data-[side=site]/plans:invisible motion-reduce:delay-0">
                {booking[index] && card(booking, index)}
              </div>
              <div className="invisible [grid-area:1/1] [backface-visibility:hidden] [transform:rotateY(180deg)] transition-[visibility] delay-300 duration-0 group-data-[side=site]/plans:visible motion-reduce:delay-0">
                {siteOnly[index] && card(siteOnly, index)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </PlanFlip>
  );
}
