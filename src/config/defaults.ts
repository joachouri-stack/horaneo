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
  /** Préavis avant d'appliquer le nouveau prix d'un pack à un abonné (après la fin de son engagement), en jours. */
  price_change_notice_days: 30,
  /**
   * Fonctions annoncées « Bientôt » sur le site commercial : pas encore livrées,
   * elles portent l'étiquette au lieu d'être promises. Retirer une clé quand la fonction est prête.
   */
  features_soon: [
    "contactForm",
    "businessSections",
    "seoPages",
    "visibilityReport",
    "paymentLinks",
    "multilingual",
    "qrPoster",
  ] as string[],
  /** Rachat du site par le client quand il part (désactivé par défaut) et son prix TTC en centimes. */
  site_buyout_enabled: false as boolean,
  site_buyout_price_cents: 0,
  /** Identité légale du SaaS (pages Mentions légales, Conditions, Confidentialité), remplie depuis l'admin. */
  legal_identity: {
    companyName: "",
    legalForm: "",
    siret: "",
    address: "",
    publicationDirector: "",
    host: "",
    vatRegime: "",
    consumerMediator: "",
  } as LegalIdentity,
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

/** Identité légale du SaaS : jamais inventée, saisie par l'administratrice. */
export type LegalIdentity = {
  companyName: string;
  legalForm: string;
  siret: string;
  address: string;
  publicationDirector: string;
  /** Hébergeur du site : nom, adresse, téléphone. */
  host: string;
  vatRegime: string;
  consumerMediator: string;
};

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
  /** Frais de création de la formule sans engagement (avec engagement : création offerte). */
  noCommitmentFeeCents: number | null;
  /** Pack « site seul » : le pack avec réservation qui le reprend entièrement (« Pour ajouter la réservation »). */
  bookingTwinCode?: string | null;
  /** Lignes visibles sur la carte du pack (6 au plus), dans l'ordre ; le reste se déplie. */
  highlights: string[];
  sortOrder: number;
  limits: PlanLimits;
  features: PlanFeatures;
};

/** Fonctions qu'aucun pack ne promet par défaut (chaque pack les active). */
const NONE = {
  onlineBooking: false,
  fullSite: false,
  customDomain: false,
  onlinePayment: false,
  promoCodes: false,
  testimonials: false,
  stats: false,
  monthlySummary: false,
  brandingFooter: false,
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
  localSeo: false,
  contactButtons: false,
  mobileReady: false,
  sitePages: false,
  contactForm: false,
  kickoffCall: false,
  copywriting: false,
  photoRetouch: false,
  businessSections: false,
  seoPages: false,
  searchConsole: false,
  googleBusiness: false,
  visibilityReport: false,
  paymentLinks: false,
  multilingual: false,
  qrPoster: false,
} satisfies PlanFeatures;

/** Site vitrine (Express) : une page, son nom de domaine, les boutons de contact. */
const EXPRESS = {
  ...NONE,
  customDomain: true,
  localSeo: true,
  contactButtons: true,
  mobileReady: true,
  emailSupport: true,
  monthlyUpdate: true,
} satisfies PlanFeatures;

/** Site complet (Vitrine) : tout Express, plusieurs pages, formulaire, promotions et témoignages. */
const VITRINE = {
  ...EXPRESS,
  fullSite: true,
  sitePages: true,
  contactForm: true,
  promotions: true,
  testimonials: true,
} satisfies PlanFeatures;

/** Accompagnement complet (Signature) : tout Vitrine, et nous nous occupons de tout. */
const SIGNATURE = {
  ...VITRINE,
  kickoffCall: true,
  copywriting: true,
  photoRetouch: true,
  businessSections: true,
  seoPages: true,
  searchConsole: true,
  googleBusiness: true,
  googleReviews: true,
  visibilityReport: true,
  // Paiement par carte : liens de paiement, acomptes sur devis, cartes cadeaux.
  onlinePayment: true,
  paymentLinks: true,
  giftCards: true,
  multilingual: true,
  qrPoster: true,
  stats: true,
  monthlyUpdate: false,
  onDemandUpdates: true,
  whatsappSupport: true,
} satisfies PlanFeatures;

/** Réservation en ligne, ajoutée par les packs Essentiel et Sérénité. */
const BOOKING = {
  onlineBooking: true,
  onlinePayment: true,
  promoCodes: true,
  customerSpace: true,
} satisfies PlanFeatures;

/**
 * Les packs de départ. null = illimité. Deux familles : avec réservation
 * (Basic, Essentiel, Sérénité) et « site seul » (Express, Vitrine, Signature).
 * Règle des jumeaux : un pack avec réservation comprend tout son pack « site
 * seul » (Vitrine → Essentiel, Signature → Sérénité ; Express → Essentiel).
 */
export const DEFAULT_PLANS: PlanSeed[] = [
  {
    code: "basic",
    name: { fr: "Basic", en: "Basic", es: "Basic", ru: "Basic" },
    description: { fr: "Pour essayer sans rien payer" },
    priceCents: 0,
    noCommitmentFeeCents: null,
    highlights: ["basePage", "bookings", "agenda", "emailReminders", "photosServices"],
    sortOrder: 1,
    limits: { onlineBookingsPerMonth: 5, members: 1, photos: 5, services: 10, smsPerMonth: 0 },
    features: { ...NONE, onlineBooking: true, brandingFooter: true },
  },
  {
    code: "essentiel",
    name: { fr: "Essentiel", en: "Essential", es: "Esencial", ru: "Основной" },
    description: { fr: "Un vrai site à vos couleurs, avec la réservation" },
    priceCents: 3999,
    noCommitmentFeeCents: 14900,
    highlights: ["everythingIn:vitrine", "bookings", "onlinePayment", "sms", "customerSpace", "members"],
    sortOrder: 2,
    limits: { onlineBookingsPerMonth: null, members: 3, photos: 20, services: null, smsPerMonth: 100 },
    features: { ...VITRINE, ...BOOKING },
  },
  {
    code: "serenite",
    name: { fr: "Sérénité", en: "Serenity", es: "Serenidad", ru: "Безмятежность" },
    description: { fr: "Ne vous occupez plus de rien" },
    priceCents: 7900,
    noCommitmentFeeCents: 24900,
    highlights: ["everythingIn:signature", "bookings", "sms", "loyalty", "stats", "members"],
    sortOrder: 3,
    limits: { onlineBookingsPerMonth: null, members: null, photos: null, services: null, smsPerMonth: 300 },
    features: { ...SIGNATURE, ...BOOKING, monthlySummary: true, loyalty: true, aiMessaging: true },
  },
];

/** Packs « site seul » : un site, sans réservation en ligne (ajoutée en passant à leur jumeau). */
export const DEFAULT_SITE_ONLY_PLANS: PlanSeed[] = [
  {
    code: "express",
    name: { fr: "Express", en: "Express", es: "Express", ru: "Экспресс" },
    description: { fr: "Votre vitrine en une page" },
    priceCents: 900,
    noCommitmentFeeCents: 4900,
    bookingTwinCode: "essentiel",
    highlights: ["onePage", "customDomain", "contactButtons", "photosServices", "monthlyUpdate", "hosting"],
    sortOrder: 4,
    limits: { onlineBookingsPerMonth: 0, members: 1, photos: 10, services: 20, smsPerMonth: 0 },
    features: EXPRESS,
  },
  {
    code: "vitrine",
    name: { fr: "Vitrine", en: "Showcase", es: "Escaparate", ru: "Витрина" },
    description: { fr: "Un vrai site à vos couleurs" },
    priceCents: 2200,
    noCommitmentFeeCents: 14900,
    bookingTwinCode: "essentiel",
    highlights: [
      "everythingIn:express",
      "fullSite",
      "contactForm",
      "promotionsTestimonials",
      "photos",
      "monthlyUpdate",
    ],
    sortOrder: 5,
    limits: { onlineBookingsPerMonth: 0, members: 3, photos: 20, services: null, smsPerMonth: 0 },
    features: VITRINE,
  },
  {
    code: "signature",
    name: { fr: "Signature", en: "Signature", es: "Firma", ru: "Подпись" },
    description: { fr: "Un site à votre image" },
    priceCents: 4900,
    noCommitmentFeeCents: 24900,
    bookingTwinCode: "serenite",
    highlights: ["everythingIn:vitrine", "withYou", "google", "cardPayment", "multilingual", "careUpdates"],
    sortOrder: 6,
    limits: { onlineBookingsPerMonth: 0, members: null, photos: null, services: null, smsPerMonth: 0 },
    features: SIGNATURE,
  },
];
