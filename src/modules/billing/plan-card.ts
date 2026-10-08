import { formatMoney } from "@/lib/format";
import { pickLocalized, type Locale, type LocalizedText } from "@/i18n/locales";
import { planAllowsBooking } from "./features";
import {
  bookingTwinOf,
  planFullList,
  planHighlights,
  planTiles,
  type ShowcaseLine,
  type ShowcasePlan,
  type ShowcaseTile,
} from "./showcase";

/**
 * Contenu d'une carte de pack, en textes prêts à afficher : tout vient des
 * réglages du pack (prix, limites, fonctions, lignes visibles) et des réglages
 * généraux (pack de SMS, fonctions « Bientôt »). La carte l'affiche tel quel,
 * et un test vérifie qu'elle reprend exactement ces valeurs.
 */

export type CardPlan = ShowcasePlan & {
  id: string;
  name: LocalizedText;
  description: LocalizedText | null;
};

/** Traducteur de l'espace « home.plans » (next-intl, ou createTranslator dans les tests). */
export type PlansTranslator = (key: string, values?: Record<string, string | number>) => string;

export type CardLine = { text: string; soon: boolean };

export type CardContent = {
  code: string;
  name: string;
  description: string;
  price: string;
  priceSuffix: string;
  tiles: { key: string; value: string; label: string }[];
  smsExtra: string | null;
  cta: { label: string; href: { pathname: string; query: Record<string, string> } };
  highlights: CardLine[];
  full: { grouped: boolean; groups: { title: string | null; lines: CardLine[] }[]; missing: CardLine[] };
  /** Pack « site seul » : le pack qui ajoute la réservation. */
  addBooking: string | null;
};

export function planCardContent(
  plan: CardPlan,
  plans: CardPlan[],
  options: {
    t: PlansTranslator;
    locale: Locale;
    soon: ReadonlySet<string>;
    smsPack: { size: number; priceCents: number };
    /** Commande en ligne ouverte (pages légales publiées) : sinon, les packs payants mènent au rappel. */
    salesOpen: boolean;
  },
): CardContent {
  const { t, locale, soon } = options;
  const money = (cents: number) => formatMoney(cents, "EUR", locale);
  const nameOf = (code: string) =>
    pickLocalized(plans.find((item) => item.code === code)?.name ?? null, locale);
  const text = (prefix: "highlights" | "lines", line: ShowcaseLine): CardLine => ({
    text:
      line.key === "everythingIn"
        ? t(`${prefix}.everythingIn`, { plan: nameOf(String(line.values?.planCode)) })
        : t(`${prefix}.${line.key}`, line.values),
    soon: line.soon,
  });
  const name = pickLocalized(plan.name, locale);
  const full = planFullList(plan, plans, soon);
  const twin = planAllowsBooking(plan.features) ? null : bookingTwinOf(plan, plans);
  const paid = plan.priceCents > 0;
  return {
    code: plan.code,
    name,
    description: pickLocalized(plan.description, locale),
    price: money(plan.priceCents),
    priceSuffix: paid ? t("perMonthShort") : t("freeForever"),
    tiles: planTiles(plan).map((tile) => ({ key: tile.key, ...tileText(tile, t) })),
    smsExtra:
      (plan.limits.smsPerMonth ?? 0) > 0 && options.smsPack.priceCents > 0
        ? t("smsExtra", { amount: money(options.smsPack.priceCents), count: options.smsPack.size })
        : null,
    cta: {
      label: paid ? t("choose", { plan: name }) : t("start"),
      href: {
        pathname: paid && !options.salesOpen ? "/rappel" : "/commander",
        query: { pack: plan.code },
      },
    },
    highlights: planHighlights(plan, plans, soon).map((line) => text("highlights", line)),
    full: {
      grouped: full.grouped,
      groups: full.groups.map((group) => ({
        title: group.group ? t(`groups.${group.group}`) : null,
        lines: group.lines.map((line) => text("lines", line)),
      })),
      missing: full.missing.map((line) => text("lines", line)),
    },
    addBooking: twin ? t("addBooking", { plan: pickLocalized(twin.name, locale) }) : null,
  };
}

function tileText(item: ShowcaseTile, t: PlansTranslator) {
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
}
