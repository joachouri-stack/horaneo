import { getTranslations } from "next-intl/server";
import type { PlanFeatures, PlanLimits } from "@/db/schema";
import { Link } from "@/i18n/navigation";
import { pickLocalized, type Locale, type LocalizedText } from "@/i18n/locales";
import { planItems, planTiles, type ShowcaseItem, type ShowcaseTile } from "@/modules/billing/showcase";
import { ArrowIcon, CheckIcon, DashIcon, PLAN_ICONS, StarIcon } from "./icons";

type Plan = {
  id: string;
  code: string;
  name: LocalizedText;
  description: LocalizedText | null;
  priceCents: number;
  limits: PlanLimits;
  features: PlanFeatures;
};

/**
 * Cartes des packs : prix, trois chiffres clés, bouton, ce qui est inclus.
 * Tout vient de la base ; le dernier pack (le plus complet) est mis en avant.
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
    }
  };
  const itemText = (item: ShowcaseItem) =>
    item.kind === "everythingIn"
      ? t("items.everythingIn", { plan: pickLocalized(plans[item.planIndex].name, locale) })
      : t(`items.${item.key}`, item.kind === "included" ? item.values : undefined);

  return (
    <div className="grid items-center gap-6 lg:grid-cols-3">
      {plans.map((plan, index) => {
        const featured = plans.length > 1 && index === plans.length - 1;
        const Icon = PLAN_ICONS[Math.min(index, PLAN_ICONS.length - 1)];
        const name = pickLocalized(plan.name, locale);
        const description = pickLocalized(plan.description, locale);
        const items = planItems(plans, index);
        return (
          <article
            key={plan.id}
            className={`hn-reveal group relative flex flex-col gap-[1.4rem] overflow-hidden rounded-[2rem] px-8 transition duration-300 hover:-translate-y-2.5 ${
              featured
                ? "hn-glow-border py-11 text-sand shadow-[0_30px_60px_rgba(27,42,74,.35)] hover:shadow-[0_34px_64px_rgba(27,42,74,.45)]"
                : "border-2 border-line bg-white py-8 text-body hover:border-coral hover:shadow-[0_28px_56px_rgba(22,24,29,.16)]"
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
                className={`flex size-[3.2rem] flex-none items-center justify-center rounded-2xl ${
                  featured
                    ? "bg-coral text-white"
                    : index === 0
                      ? "bg-sand text-night"
                      : "bg-blush text-brick"
                }`}
              >
                <Icon className="size-6" />
              </span>
              <div>
                <h3
                  className={`text-[1.45rem] font-semibold leading-tight ${featured ? "text-white" : "text-night"}`}
                >
                  {name}
                </h3>
                {description && (
                  <p className={`text-[0.95rem] ${featured ? "text-[#c9d0de]" : "text-stone"}`}>
                    {description}
                  </p>
                )}
              </div>
            </div>
            <p
              className={`relative font-display text-[3.6rem] font-bold leading-none tracking-[-0.03em] ${featured ? "text-white" : "text-night"}`}
            >
              {money(plan.priceCents)}{" "}
              <span
                className={`font-sans text-base font-normal tracking-normal ${featured ? "text-[#c9d0de]" : "text-stone"}`}
              >
                {plan.priceCents > 0 ? t("perMonthShort") : t("freeForever")}
              </span>
            </p>
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
              className={`relative flex items-center justify-center gap-2.5 rounded-full p-4 text-[1.05rem] font-semibold transition hover:-translate-y-0.5 ${
                featured
                  ? "bg-brick text-white hover:shadow-[0_12px_26px_rgba(212,64,47,.32)]"
                  : "bg-blush text-rust hover:bg-brick hover:text-white"
              }`}
            >
              {plan.priceCents > 0 ? t("choose", { plan: name }) : t("start")}
              <ArrowIcon className="size-[18px] transition-transform group-hover:translate-x-1.5" />
            </Link>
            <ul
              className={`relative flex flex-col gap-3 border-t pt-[1.4rem] ${featured ? "border-[#3a4a6e]" : "border-line"}`}
            >
              {items.map((item, itemIndex) => {
                const missing = item.kind === "missing";
                return (
                  <li
                    key={itemIndex}
                    className={`flex gap-2.5 ${missing ? (featured ? "text-[#c9d0de]" : "text-stone") : ""}`}
                  >
                    {missing ? (
                      <DashIcon className="mt-[3px] size-5 flex-none text-[#b5afa4]" />
                    ) : (
                      <CheckIcon
                        className={`mt-[3px] size-5 flex-none ${featured ? "text-salmon" : "text-brick"}`}
                      />
                    )}
                    <span>
                      <span className="sr-only">{missing ? t("missing") : t("included")} </span>
                      {itemText(item)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
