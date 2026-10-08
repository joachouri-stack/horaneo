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
  /** Frais de création ajoutés quand le client choisit la formule sans engagement, en centimes. */
  no_commitment_setup_fee_cents: 14900,
  /** Pack de SMS supplémentaires : nombre de SMS et prix TTC en centimes. */
  sms_pack_size: 100,
  sms_pack_price_cents: 800,
  /** Alerte à la gérante quand ce pourcentage du quota de SMS du mois est atteint (puis à 100 %). */
  sms_warning_percent: 80,
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
  /** Demande d'avis Google : heures après la fin du rendez-vous. */
  review_request_delay_hours: 3,
  /** Pas de demande si le rendez-vous est marqué « venue » plus de ce nombre de jours après. */
  review_request_max_age_days: 7,
  /** Une seule demande par cliente sur cette durée, en jours. */
  review_request_cooldown_days: 180,
  /** Nombre d'essais d'envoi d'un message avant abandon. */
  message_max_attempts: 5,
  /** Taux de TVA appliqué aux abonnements, en pourcentage (à valider avec le comptable). */
  vat_rate_percent: 20,
  /** Taux de TVA créé dans Stripe pour les factures (rempli automatiquement). */
  stripe_tax_rate: null as null | { id: string; percent: number; inclusive: boolean },
  /** Hébergeur de l'infrastructure, affiché dans les mentions légales des sites (à vérifier). */
  legal_infrastructure: "Hostinger International Ltd, 61 Lordou Vironos Street, 6023 Larnaca, Chypre",
  /** Bloc « Ils nous font confiance » de l'accueil (vide = bloc caché), rempli depuis l'admin. */
  showcase: [] as ShowcaseEntry[],
} as const;

/** Témoignage d'un professionnel client, affiché sur l'accueil du site commercial. */
export type ShowcaseEntry = {
  id: string;
  /** Nom de l'établissement. */
  name: string;
  /** Métier et ville (ex. « Institut de beauté, Avignon »). */
  activity: string;
  /** Adresse du site du client (facultative). */
  url: string | null;
  quote: string;
  /** Prénom (et rôle) de la personne qui témoigne. */
  author: string;
};

export type PlatformSettingKey = keyof typeof DEFAULT_PLATFORM_SETTINGS;

type PlanSeed = {
  code: string;
  name: LocalizedText;
  /** Accroche affichée sous le nom du pack. */
  description: LocalizedText;
  priceCents: number;
  /** Frais de création propres au pack (sinon : réglage général). */
  setupFeeCents?: number | null;
  sortOrder: number;
  limits: PlanLimits;
  features: PlanFeatures;
};

/**
 * Les packs de départ. null = illimité. Trois packs avec réservation en ligne,
 * puis trois packs « site seul » du même niveau (même ordre), affichés au dos.
 */
export const DEFAULT_PLANS: PlanSeed[] = [
  {
    code: "basic",
    name: { fr: "Basic", en: "Basic", es: "Basic", ru: "Basic" },
    description: { fr: "Pour essayer sans rien payer" },
    priceCents: 0,
    sortOrder: 1,
    limits: { onlineBookingsPerMonth: 5, members: 1, photos: 5, services: 10, smsPerMonth: 0 },
    features: {
      onlineBooking: true,
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
      aiMessaging: false,
      customerSpace: false,
      loyalty: false,
    },
  },
  {
    code: "essentiel",
    name: { fr: "Essentiel", en: "Essential", es: "Esencial", ru: "Основной" },
    description: { fr: "Un vrai site à vos couleurs" },
    priceCents: 3999,
    sortOrder: 2,
    limits: { onlineBookingsPerMonth: null, members: 3, photos: 20, services: null, smsPerMonth: 100 },
    features: {
      onlineBooking: true,
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
      aiMessaging: false,
      customerSpace: true,
      loyalty: false,
    },
  },
  {
    code: "serenite",
    name: { fr: "Sérénité", en: "Serenity", es: "Serenidad", ru: "Безмятежность" },
    description: { fr: "Ne vous occupez plus de rien" },
    priceCents: 6900,
    sortOrder: 3,
    limits: { onlineBookingsPerMonth: null, members: null, photos: null, services: null, smsPerMonth: 300 },
    features: {
      onlineBooking: true,
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
      aiMessaging: true,
      customerSpace: true,
      loyalty: true,
    },
  },
];

const NO_BOOKING = {
  onlineBooking: false,
  onlinePayment: false,
  promoCodes: false,
  monthlySummary: false,
  customerSpace: false,
  loyalty: false,
  aiMessaging: false,
} as const;

/** Packs « site seul » : un site, sans réservation en ligne (ajoutée en changeant de pack). */
export const DEFAULT_SITE_ONLY_PLANS: PlanSeed[] = [
  {
    code: "express",
    name: { fr: "Express", en: "Express", es: "Express", ru: "Экспресс" },
    description: { fr: "Votre vitrine en une page" },
    priceCents: 900,
    sortOrder: 4,
    limits: { onlineBookingsPerMonth: 0, members: 1, photos: 10, services: 20, smsPerMonth: 0 },
    features: {
      ...NO_BOOKING,
      fullSite: false,
      customDomain: true,
      // Promesses d'un site vitrine, présentées sur le site commercial.
      localSeo: true,
      contactButtons: true,
      mobileReady: true,
      sitePages: false,
      customDesign: false,
      testimonials: false,
      stats: false,
      brandingFooter: false,
      emailSupport: true,
      whatsappSupport: false,
      promotions: false,
      googleReviews: false,
      giftCards: false,
      monthlyUpdate: false,
      onDemandUpdates: false,
    },
  },
  {
    code: "vitrine",
    name: { fr: "Vitrine", en: "Showcase", es: "Escaparate", ru: "Витрина" },
    description: { fr: "Un vrai site à vos couleurs" },
    priceCents: 2200,
    sortOrder: 5,
    limits: { onlineBookingsPerMonth: 0, members: 3, photos: 20, services: null, smsPerMonth: 0 },
    features: {
      ...NO_BOOKING,
      fullSite: true,
      customDomain: true,
      localSeo: true,
      contactButtons: true,
      mobileReady: true,
      sitePages: true,
      customDesign: false,
      testimonials: true,
      stats: false,
      brandingFooter: false,
      emailSupport: true,
      whatsappSupport: false,
      promotions: true,
      googleReviews: true,
      giftCards: false,
      monthlyUpdate: true,
      onDemandUpdates: false,
    },
  },
  {
    code: "signature",
    name: { fr: "Signature", en: "Signature", es: "Firma", ru: "Подпись" },
    description: { fr: "Un site sur mesure, unique" },
    priceCents: 3900,
    setupFeeCents: 29000,
    sortOrder: 6,
    limits: { onlineBookingsPerMonth: 0, members: null, photos: null, services: null, smsPerMonth: 0 },
    features: {
      ...NO_BOOKING,
      fullSite: true,
      customDomain: true,
      localSeo: true,
      contactButtons: true,
      mobileReady: true,
      sitePages: true,
      customDesign: true,
      testimonials: true,
      stats: false,
      brandingFooter: false,
      emailSupport: true,
      whatsappSupport: true,
      promotions: true,
      googleReviews: true,
      // Les cartes cadeaux se paient en ligne, même sans réservation.
      giftCards: true,
      onlinePayment: true,
      monthlyUpdate: false,
      onDemandUpdates: true,
    },
  },
];
