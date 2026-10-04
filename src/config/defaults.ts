import type { PlanFeatures, PlanLimits } from "@/db/schema/platform";
import type { LocalizedText } from "@/i18n/locales";

/**
 * Valeurs de départ. Elles sont copiées en base par `pnpm db:seed`, puis
 * modifiables depuis l'espace admin : le code lit toujours la base.
 */

export const DEFAULT_PLATFORM_SETTINGS = {
  /** "TTC" ou "HT" : affichage des prix des packs. */
  prices_display: "TTC",
  /** Durée d'engagement en mois (0 = sans engagement). */
  commitment_months: 12,
  /** Frais de création en centimes (0 = création offerte). */
  setup_fee_cents: 0,
  /** Délai de mise en ligne annoncé après une commande, en jours ouvrés. */
  go_live_delay_days: 5,
  /** Commission prélevée sur les acomptes, en pourcentage (0 = aucune). */
  deposit_commission_percent: 0,
  /** Jours pendant lesquels le site reste en ligne après la fin de l'abonnement. */
  retention_days_after_cancel: 30,
  /** Jours de conservation d'une photo remplacée. */
  replaced_asset_retention_days: 7,
  /** Hébergeur de l'infrastructure, affiché dans les mentions légales des sites (à vérifier). */
  legal_infrastructure: "Hostinger International Ltd, 61 Lordou Vironos Street, 6023 Larnaca, Chypre",
} as const;

export type PlatformSettingKey = keyof typeof DEFAULT_PLATFORM_SETTINGS;

type PlanSeed = {
  code: string;
  name: LocalizedText;
  priceCents: number;
  sortOrder: number;
  limits: PlanLimits;
  features: PlanFeatures;
};

/** Les trois packs de départ. null = illimité. */
export const DEFAULT_PLANS: PlanSeed[] = [
  {
    code: "basic",
    name: { fr: "Basic", en: "Basic", es: "Basic", ru: "Basic" },
    priceCents: 0,
    sortOrder: 1,
    limits: { onlineBookingsPerMonth: 5, members: 1, photos: 5, services: 10, smsPerMonth: 0 },
    features: {
      fullSite: false,
      customDomain: false,
      onlinePayment: false,
      promoCodes: false,
      testimonials: false,
      stats: false,
      monthlySummary: false,
      brandingFooter: true,
      emailSupport: false,
      whatsappSupport: false,
    },
  },
  {
    code: "essentiel",
    name: { fr: "Essentiel", en: "Essential", es: "Esencial", ru: "Основной" },
    priceCents: 3999,
    sortOrder: 2,
    limits: { onlineBookingsPerMonth: null, members: 3, photos: 20, services: null, smsPerMonth: 30 },
    features: {
      fullSite: true,
      customDomain: true,
      onlinePayment: true,
      promoCodes: true,
      testimonials: true,
      stats: false,
      monthlySummary: false,
      brandingFooter: false,
      emailSupport: true,
      whatsappSupport: false,
    },
  },
  {
    code: "serenite",
    name: { fr: "Sérénité", en: "Serenity", es: "Serenidad", ru: "Безмятежность" },
    priceCents: 6900,
    sortOrder: 3,
    limits: { onlineBookingsPerMonth: null, members: null, photos: null, services: null, smsPerMonth: 150 },
    features: {
      fullSite: true,
      customDomain: true,
      onlinePayment: true,
      promoCodes: true,
      testimonials: true,
      stats: true,
      monthlySummary: true,
      brandingFooter: false,
      emailSupport: true,
      whatsappSupport: true,
    },
  },
];
