/**
 * Pages « par métier » du site commercial (/metiers/<adresse>) : une page par métier visé,
 * pour Google et la publicité. Textes : trades.items.<clé> (messages). Pour ajouter un métier :
 * une ligne ici et ses textes.
 */
export const TRADE_PAGES = [
  { slug: "institut-de-beaute", key: "beauty" },
  { slug: "coiffeur", key: "hair" },
  { slug: "bien-etre", key: "wellness" },
  { slug: "coach", key: "coaching" },
  { slug: "cours-particuliers", key: "lessons" },
  { slug: "photographe", key: "photo" },
  { slug: "garage", key: "garage" },
  { slug: "artisan", key: "craft" },
  { slug: "consultant", key: "consulting" },
] as const;

export type TradeKey = (typeof TRADE_PAGES)[number]["key"];

export const tradeBySlug = (slug: string) => TRADE_PAGES.find((trade) => trade.slug === slug) ?? null;
