import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pickLocalized, type Locale, type LocalizedText } from "@/i18n/locales";
import {
  planCardContent,
  type CardLine,
  type CardPlan,
  type PlansTranslator,
} from "@/modules/billing/plan-card";
import { planSheet } from "@/modules/billing/plan-sheet";
import { FlipCard } from "./FlipCard";
import { ArrowIcon, CheckIcon, PLAN_ICONS, StarIcon } from "./icons";
import { SitePreview } from "./SitePreview";

type CardOption = { code: string; name: LocalizedText; isAvailable: boolean };

/**
 * Cartes des packs, chacune à deux faces (FlipCard) :
 * - recto : nom, prix, cible, aperçu de site, chiffres clés, 6 avantages au plus
 *   (choisis dans l'admin), bouton « Choisir ce pack » ;
 * - verso : rubriques détaillées (pages, personnalisation, gestion,
 *   référencement, hébergement, support), options disponibles, conditions.
 * Tout vient des réglages des packs et des options. Le pack du milieu (Business)
 * est mis en avant. Ordinateur : trois colonnes alignées ; téléphone : l'une
 * sous l'autre, le pack recommandé en premier.
 */
export async function PlanCards({
  plans,
  options,
  locale,
  smsPack,
  soon,
  salesOpen,
  conditions,
}: {
  plans: CardPlan[];
  /** Options du catalogue, présentées au verso. */
  options: CardOption[];
  locale: Locale;
  smsPack: { size: number; priceCents: number };
  /** Fonctions pas encore livrées : étiquette « Bientôt ». */
  soon: string[];
  /** Commande en ligne ouverte ; sinon les packs payants mènent au formulaire « Être rappelé ». */
  salesOpen: boolean;
  conditions: { commitmentMonths: number; display: string };
}) {
  const t = await getTranslations("home.plans");
  const translate = t as unknown as PlansTranslator;
  const soonSet = new Set(soon);
  // Pack recommandé : celui du milieu (le dernier s'il n'y en a que deux).
  const featuredIndex = plans.length >= 3 ? Math.floor(plans.length / 2) : plans.length - 1;

  const card = (plan: CardPlan, index: number) => {
    const featured = plans.length > 1 && index === featuredIndex;
    const Icon = PLAN_ICONS[Math.min(index, PLAN_ICONS.length - 1)];
    const content = planCardContent(plan, plans, { t: translate, locale, soon: soonSet, smsPack, salesOpen });
    // Verso : les différences avec le pack précédent (« Tout le pack Essentiel, plus : »).
    const previous = index > 0 ? plans[index - 1] : undefined;
    const sheet = planSheet(plan, soonSet, previous);
    const strong = featured ? "text-white" : "text-night";
    const muted = featured ? "text-[#c9d0de]" : "text-stone";
    const accent = featured ? "text-gold" : "text-copper";
    const rule = featured ? "border-[#34466b]" : "border-line";
    const ctaLabel = content.cta.label === t("callback") ? content.cta.label : t("chooseThis");
    const href = content.cta.href as { pathname: "/commander"; query: Record<string, string> };

    const soonTag = (
      <span
        className={`ml-2 inline-block rounded-full px-2 py-px align-middle text-[0.68rem] font-semibold uppercase tracking-[0.05em] ${
          featured ? "bg-navy-light text-gold" : "bg-cream text-copper"
        }`}
      >
        {t("soonTag")}
      </span>
    );
    const line = (item: CardLine, key: string) => (
      <li key={key} className="flex items-start gap-2.5">
        <span
          className={`mt-[3px] flex size-[1.1rem] flex-none items-center justify-center rounded-full ${
            featured ? "bg-[#33456b] text-gold" : "bg-cream text-copper"
          }`}
        >
          <CheckIcon className="size-3" />
        </span>
        <span>
          {item.text}
          {item.soon && soonTag}
        </span>
      </li>
    );
    const cta = (
      <Link
        href={href}
        aria-label={`${ctaLabel} : ${content.name}`}
        className={`group/cta relative mt-6 flex min-h-12 items-center justify-center gap-2 rounded-full px-4 py-3 text-[0.98rem] font-semibold transition duration-200 hover:-translate-y-0.5 motion-reduce:transition-none ${
          featured
            ? "bg-brick text-white hover:shadow-[0_12px_26px_rgba(212,64,47,.38)]"
            : "bg-mist text-navy hover:bg-navy hover:text-white hover:shadow-[0_12px_26px_rgba(27,42,74,.25)]"
        }`}
      >
        {ctaLabel}
        <ArrowIcon
          className={`size-[18px] shrink-0 transition-transform group-hover/cta:translate-x-1 ${
            featured ? "" : "text-copper group-hover/cta:text-white"
          }`}
        />
      </Link>
    );
    const header = (
      <div className="relative flex items-start gap-3">
        <span
          className={`flex size-11 flex-none items-center justify-center rounded-2xl ${
            featured ? "bg-gold text-navy" : "bg-cream text-copper"
          }`}
        >
          <Icon className="size-[22px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className={`font-display text-[1.4rem] font-bold uppercase leading-tight tracking-[0.02em] ${strong}`}
          >
            {content.name}
          </h3>
          {content.description && (
            <p className={`mt-0.5 text-[0.92rem] leading-snug ${muted}`}>{content.description}</p>
          )}
        </div>
      </div>
    );

    const front = (
      <>
        {featured && (
          <p className="absolute left-1/2 top-0 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-gold px-3.5 py-1 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-navy shadow-[0_8px_20px_-6px_rgba(212,167,90,.6)]">
            <StarIcon className="size-3.5" />
            {t("recommended")}
          </p>
        )}
        {header}
        <SitePreview
          tier={index}
          pages={plan.limits.pages ?? null}
          tone={featured ? "dark" : "light"}
          label={t("preview", { plan: content.name })}
          more={(count) => t("previewMore", { count })}
        />
        <p className="relative mt-5 flex flex-wrap items-baseline gap-x-1.5">
          <span
            className={`font-display text-[2.4rem] font-bold leading-none tracking-[-0.03em] lg:text-[2.6rem] ${strong}`}
          >
            {content.price}
          </span>
          <span className={`text-[0.92rem] ${muted}`}>
            {content.priceSuffix} {conditions.display}
          </span>
        </p>
        <dl
          className={`relative mt-4 grid grid-cols-3 divide-x rounded-2xl border ${rule} ${featured ? "divide-[#34466b]" : "divide-line"}`}
        >
          {content.tiles.map((item) => (
            <div key={item.key} className="flex flex-col-reverse items-center px-1.5 py-2.5 text-center">
              <dt className={`text-[0.7rem] leading-tight ${muted}`}>{item.label}</dt>
              <dd className={`text-[0.98rem] font-semibold leading-tight ${strong}`}>{item.value}</dd>
            </div>
          ))}
        </dl>
        <ul className="relative mt-5 flex flex-col gap-2.5 text-[0.94rem] leading-snug">
          {content.highlights.map((item, i) => line(item, `h${i}`))}
        </ul>
        <div className="mt-auto">{cta}</div>
      </>
    );

    const back = (
      <>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className={`font-display text-[1.15rem] font-bold leading-tight ${strong}`}>
            {t("detailsTitle", { plan: content.name })}
          </h3>
          <p className={`whitespace-nowrap text-[0.9rem] font-semibold ${accent}`}>
            {content.price} <span className="font-normal">{content.priceSuffix}</span>
          </p>
        </div>
        {previous && (
          <p className={`mt-3 text-[0.9rem] font-semibold ${strong}`}>
            {t("sheetEverythingIn", { plan: pickLocalized(previous.name, locale) })}
          </p>
        )}
        {/* Rubriques compactes : une ligne de titre, puis les éléments à la suite. */}
        <dl className="mt-4 flex flex-col gap-2 text-[0.84rem] leading-snug">
          {sheet.map((group) => (
            <div key={group.section}>
              <dt className={`text-[0.68rem] font-semibold uppercase tracking-[0.08em] ${accent}`}>
                {t(`sheet.sections.${group.section}`)}
              </dt>
              <dd>
                {group.lines.map((item, i) => (
                  <span key={item.key}>
                    {i > 0 && (
                      <span aria-hidden="true" className={`mx-1.5 ${accent}`}>
                        ·
                      </span>
                    )}
                    {translate(`sheet.lines.${item.key}`, item.values)}
                    {item.soon && soonTag}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        {options.length > 0 && (
          <div className={`mt-3.5 border-t pt-3 ${rule}`}>
            <p className={`text-[0.68rem] font-semibold uppercase tracking-[0.08em] ${accent}`}>
              {t("optionsTitle")}
            </p>
            <p className="text-[0.85rem] leading-snug">
              {options
                .filter((option) => option.isAvailable)
                .map((option) => pickLocalized(option.name, locale))
                .join(" · ")}
            </p>
            <a
              href="#options"
              className={`inline-flex min-h-11 items-center gap-1 text-[0.85rem] font-semibold underline underline-offset-4 ${accent}`}
            >
              {t("optionsLink")}
            </a>
          </div>
        )}
        <div className={`border-t pt-3 ${rule}`}>
          <p className={`text-[0.68rem] font-semibold uppercase tracking-[0.08em] ${accent}`}>
            {t("subscriptionTitle")}
          </p>
          <p className={`text-[0.84rem] leading-snug ${muted}`}>
            {[
              t("subscription.commitment", { months: conditions.commitmentMonths }),
              t("subscription.creationFree"),
              t("subscription.display", { display: conditions.display }),
              t("subscription.upgrade"),
            ].join(" · ")}
          </p>
        </div>
        <div className="mt-auto">{cta}</div>
      </>
    );

    const surface = `relative rounded-[1.75rem] border-2 p-6 lg:p-7 ${
      featured
        ? "border-gold bg-navy text-sand shadow-[0_28px_60px_-14px_rgba(27,42,74,.5)]"
        : "border-line bg-white text-body shadow-[0_1px_0_rgba(22,24,29,.04)]"
    }`;
    return (
      <div
        key={plan.id}
        data-plan={content.code}
        className={`flex transition duration-300 ease-out hover:-translate-y-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
          featured ? "max-lg:order-first" : ""
        }`}
      >
        <FlipCard
          front={front}
          back={back}
          surface={surface}
          tone={featured ? "dark" : "light"}
          labels={{
            details: t("details"),
            detailsLabel: t("detailsOf", { plan: content.name }),
            back: t("back"),
            backLabel: t("backOf", { plan: content.name }),
          }}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-8 pt-3 lg:grid lg:grid-cols-3 lg:items-stretch lg:gap-6">
      {plans.map((plan, index) => card(plan, index))}
    </div>
  );
}
