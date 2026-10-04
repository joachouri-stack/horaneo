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
  /** Heure locale du rappel par SMS, la veille du rendez-vous (décision n° 6). */
  sms_reminder_time: "18:00",
  /** Rappel par e-mail : nombre d'heures avant le rendez-vous. */
  email_reminder_hours_before: 24,
  /** Heure locale du résumé du lendemain envoyé à la gérante. */
  daily_summary_time: "19:00",
  /** Heure locale du résumé mensuel, le 1er du mois. */
  monthly_summary_time: "08:00",
  /** Nombre d'essais d'envoi d'un message avant abandon. */
  message_max_attempts: 5,
  /** Taux de TVA appliqué aux abonnements, en pourcentage (à valider avec le comptable). */
  vat_rate_percent: 20,
  /** Taux de TVA créé dans Stripe pour les factures (rempli automatiquement). */
  stripe_tax_rate: null as null | { id: string; percent: number; inclusive: boolean },
  /** Hébergeur de l'infrastructure, affiché dans les mentions légales des sites (à vérifier). */
  legal_infrastructure: "Hostinger International Ltd, 61 Lordou Vironos Street, 6023 Larnaca, Chypre",
} as const;

export type PlatformSettingKey = keyof typeof DEFAULT_PLATFORM_SETTINGS;

type PlanSeed = {
  code: string;
  name: LocalizedText;
  /** Accroche affichée sous le nom du pack. */
  description: LocalizedText;
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
    description: { fr: "Pour essayer sans rien payer" },
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
      promotions: false,
      googleReviews: false,
      giftCards: false,
      monthlyUpdate: false,
      onDemandUpdates: false,
    },
  },
  {
    code: "essentiel",
    name: { fr: "Essentiel", en: "Essential", es: "Esencial", ru: "Основной" },
    description: { fr: "Un vrai site à vos couleurs" },
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
      promotions: true,
      googleReviews: false,
      giftCards: false,
      monthlyUpdate: true,
      onDemandUpdates: false,
    },
  },
  {
    code: "serenite",
    name: { fr: "Sérénité", en: "Serenity", es: "Serenidad", ru: "Безмятежность" },
    description: { fr: "Ne vous occupez plus de rien" },
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
      promotions: true,
      googleReviews: true,
      giftCards: true,
      monthlyUpdate: false,
      onDemandUpdates: true,
    },
  },
];
