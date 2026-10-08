import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import {
  planCardContent,
  type CardLine,
  type CardPlan,
  type PlansTranslator,
} from "@/modules/billing/plan-card";
import { splitPlans } from "@/modules/billing/showcase";
import { ArrowIcon, CheckIcon, DashIcon, PLAN_ICONS, StarIcon } from "./icons";
import { PlanDetails } from "./PlanDetails";
import { PlanFlip } from "./PlanFlip";

/**
 * Cartes des packs : prix, trois chiffres clés, bouton, puis les lignes
 * visibles (6 au plus) et un bouton qui déplie tout ce qui est inclus. Tout
 * vient de la base (voir planCardContent) ; le dernier pack de chaque famille
 * est mis en avant. Les packs « site seul » sont au dos des packs avec
 * réservation : un interrupteur retourne toutes les cartes.
 */
export async function PlanCards({
  plans,
  locale,
  smsPack,
  soon,
  salesOpen,
}: {
  plans: CardPlan[];
  locale: Locale;
  /** Pack de SMS supplémentaires (réglages), annoncé sur les cartes qui comprennent des SMS. */
  smsPack: { size: number; priceCents: number };
  /** Fonctions pas encore livrées : étiquette « Bientôt ». */
  soon: string[];
  /** Commande en ligne ouverte ; sinon les packs payants mènent au formulaire « Être rappelé ». */
  salesOpen: boolean;
}) {
  const t = await getTranslations("home.plans");
  const translate = t as unknown as PlansTranslator;
  const soonSet = new Set(soon);
  const { booking, siteOnly } = splitPlans(plans);

  const card = (group: CardPlan[], index: number) => {
    const plan = group[index];
    const featured = group.length > 1 && index === group.length - 1;
    const Icon = PLAN_ICONS[Math.min(index, PLAN_ICONS.length - 1)];
    const content = planCardContent(plan, plans, {
      t: translate,
      locale,
      soon: soonSet,
      smsPack,
      salesOpen,
    });
    const muted = featured ? "text-[#c9d0de]" : "text-stone";
    const strong = featured ? "text-white" : "text-night";
    const accent = featured ? "text-salmon" : "text-navy";
    const list = "relative flex flex-col gap-3 text-[0.93rem] leading-snug";

    const line = (item: CardLine, key: string, missing = false) => (
      <li key={key} className={`flex items-start gap-3 ${missing ? muted : ""}`}>
        <span
          className={`mt-[3px] flex size-[1.15rem] flex-none items-center justify-center rounded-full ${
            missing
              ? featured
                ? "bg-[#2c3b5e] text-[#8f9bb5]"
                : "bg-sand text-[#b5afa4]"
              : featured
                ? "bg-[#33456b] text-salmon"
                : "bg-mist text-coral"
          }`}
        >
          {missing ? <DashIcon className="size-3" /> : <CheckIcon className="size-3" />}
        </span>
        <span>
          <span className="sr-only">{missing ? t("missing") : t("included")} </span>
          {item.text}
          {item.soon && (
            <span
              className={`ml-2 inline-block rounded-full px-2 py-px align-middle text-[0.7rem] font-semibold uppercase tracking-[0.05em] ${
                featured ? "bg-navy-light text-salmon" : "bg-blush text-rust"
              }`}
            >
              {t("soonTag")}
            </span>
          )}
        </span>
      </li>
    );
    const summary = <ul className={list}>{content.highlights.map((item, i) => line(item, `h${i}`))}</ul>;
    const full = (
      <div className="flex flex-col gap-4">
        {content.full.groups.map((group, groupIndex) => (
          <div key={groupIndex}>
            {group.title && (
              <p className={`mb-2 text-[0.78rem] font-semibold uppercase tracking-[0.06em] ${accent}`}>
                {group.title}
              </p>
            )}
            <ul className={list}>{group.lines.map((item, i) => line(item, `f${groupIndex}-${i}`))}</ul>
          </div>
        ))}
        {content.full.missing.length > 0 && (
          <ul className={list}>{content.full.missing.map((item, i) => line(item, `m${i}`, true))}</ul>
        )}
      </div>
    );

    return (
      <article
        key={plan.id}
        data-plan={content.code}
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
          className="pointer-events-none absolute right-5 top-5 size-2.5 rounded-full bg-coral transition duration-500 ease-out group-hover/card:-translate-x-3 group-hover/card:translate-y-3 motion-reduce:transition-none"
        />

        {/* En-tête : icône, nom, accroche */}
        <div className="relative flex items-start gap-3">
          <span
            className={`flex size-10 flex-none items-center justify-center rounded-xl transition duration-300 group-hover/card:-rotate-6 group-hover/card:scale-105 motion-reduce:transition-none ${
              featured ? "bg-coral text-white" : "bg-mist text-coral"
            }`}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3
                className={`font-display text-[1.25rem] font-bold leading-tight tracking-[-0.02em] ${strong}`}
              >
                {content.name}
              </h3>
              {featured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-coral px-2.5 py-0.5 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[#2a0f0a]">
                  <StarIcon className="size-3" />
                  {t("recommended")}
                </span>
              )}
            </div>
            {content.description && (
              <p className={`mt-0.5 text-[0.9rem] leading-snug ${muted}`}>{content.description}</p>
            )}
          </div>
        </div>

        {/* Prix */}
        <div className="relative mt-6">
          <p className="flex items-baseline gap-1.5">
            <span
              className={`font-display text-[2.15rem] font-bold leading-none tracking-[-0.03em] lg:text-[2.4rem] ${strong}`}
            >
              {content.price}
            </span>
            <span className={`text-[0.9rem] ${muted}`}>{content.priceSuffix}</span>
          </p>
        </div>

        {/* Chiffres clés : une bande fine, trois colonnes */}
        <dl
          className={`relative mt-5 grid grid-cols-3 divide-x rounded-2xl border ${
            featured ? "divide-[#34466b] border-[#34466b]" : "divide-line border-line"
          }`}
        >
          {content.tiles.map((item) => (
            <div key={item.key} className="flex flex-col-reverse items-center px-1.5 py-2.5 text-center">
              <dt className={`text-[0.7rem] leading-tight ${muted}`}>{item.label}</dt>
              <dd className={`text-[0.95rem] font-semibold leading-tight ${strong}`}>{item.value}</dd>
            </div>
          ))}
        </dl>

        {content.smsExtra && (
          <p className={`relative mt-2 text-center text-[0.8rem] ${muted}`}>{content.smsExtra}</p>
        )}

        <Link
          href={content.cta.href as { pathname: "/commander"; query: Record<string, string> }}
          className={`group/cta relative mt-5 flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-3 text-[0.98rem] font-semibold transition duration-200 hover:-translate-y-0.5 motion-reduce:transition-none ${
            featured
              ? "bg-brick text-white hover:shadow-[0_12px_26px_rgba(212,64,47,.38)]"
              : "bg-mist text-navy hover:bg-navy hover:text-white hover:shadow-[0_12px_26px_rgba(27,42,74,.25)]"
          }`}
        >
          {content.cta.label}
          <ArrowIcon
            className={`size-[18px] shrink-0 transition-transform group-hover/cta:translate-x-1 ${
              featured ? "" : "text-coral group-hover/cta:text-white"
            }`}
          />
        </Link>

        {/* Ce qui est inclus : 6 lignes au plus, puis un bouton qui déplie toute la liste. */}
        <div className={`relative mt-6 border-t pt-5 ${featured ? "border-[#34466b]" : "border-line"}`}>
          <PlanDetails
            summary={summary}
            full={full}
            labels={{ more: t("seeAll"), less: t("collapse") }}
            className={accent}
          />
        </div>

        {content.addBooking && (
          <p
            className={`relative mt-auto flex gap-2.5 rounded-2xl px-4 py-3 text-[0.85rem] font-medium leading-snug ${
              featured ? "bg-navy-light text-white" : "bg-ivory text-night"
            }`}
          >
            <ArrowIcon className={`mt-[2px] size-4 flex-none ${accent}`} />
            {content.addBooking}
          </p>
        )}
      </article>
    );
  };

  // Téléphone : les cartes l'une sous l'autre, le pack recommandé en premier ; ordinateur : trois colonnes
  // alignées en haut (une carte dépliée s'allonge vers le bas sans déplacer ses voisines).
  const row = "flex flex-col gap-5 lg:grid lg:grid-cols-3 lg:items-start xl:gap-6";
  const cell = (index: number, count: number) =>
    `flex w-full lg:block ${index === count - 1 && count > 1 ? "max-lg:order-first" : ""}`;

  // Aucun pack « site seul » proposé : une simple rangée de cartes.
  if (siteOnly.length === 0) {
    return (
      <div className={row}>
        {booking.map((plan, index) => (
          <div key={plan.id} className={cell(index, booking.length)}>
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
      }}
    >
      <div className={row}>
        {Array.from({ length: cells }, (_, index) => (
          // Une case, deux faces superposées : la case prend la hauteur de la plus grande. Téléphone :
          // seule la face choisie occupe la place (les cartes empilées ne laissent pas de trou).
          <div key={index} className={`${cell(index, cells)} [perspective:2200px]`}>
            <div className="grid w-full items-start transition-transform duration-700 ease-in-out [transform-style:preserve-3d] lg:group-data-[side=site]/plans:[transform:rotateY(180deg)] motion-reduce:transition-none">
              {/* La face cachée devient invisible à mi-retournement : ni lue, ni atteinte au clavier. */}
              <div className="visible flex [grid-area:1/1] [backface-visibility:hidden] lg:block transition-[visibility] delay-300 duration-0 group-data-[side=site]/plans:invisible group-data-[side=site]/plans:max-lg:hidden motion-reduce:delay-0">
                {booking[index] && card(booking, index)}
              </div>
              <div className="invisible flex [grid-area:1/1] [backface-visibility:hidden] max-lg:hidden lg:block lg:[transform:rotateY(180deg)] transition-[visibility] delay-300 duration-0 group-data-[side=site]/plans:visible group-data-[side=site]/plans:max-lg:flex motion-reduce:delay-0">
                {siteOnly[index] && card(siteOnly, index)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </PlanFlip>
  );
}
