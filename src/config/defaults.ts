import type { PlanFeatures, PlanLimits } from "@/db/schema/platform";
import type { LocalizedText } from "@/i18n/locales";

/**
 * Valeurs de départ. Elles sont copiées en base par `pnpm db:seed`, puis
 * modifiables depuis l'espace admin : le code lit toujours la base.
 */

export const DEFAULT_PLATFORM_SETTINGS = {
  /** "TTC" ou "HT" : affichage des prix des packs. */
  prices_display: "HT",
  /** Facturation à l'année proposée en plus du paiement mensuel. */
  yearly_billing_enabled: true as boolean,
  /** Réduction du paiement à l'année, en mois offerts (2 : 10 mois payés pour 12). */
  yearly_free_months: 2,
  /** Durée d'engagement en mois (0 = sans engagement). */
  commitment_months: 12,
  /** Préavis avant d'appliquer le nouveau prix d'un pack à un abonné (après la fin de son engagement), en jours. */
  price_change_notice_days: 30,
  /**
   * Fonctions annoncées « Bientôt » sur le site commercial : pas encore livrées,
   * elles portent l'étiquette au lieu d'être promises. Retirer une clé quand la fonction est prête.
   */
  features_soon: [
    // Grille Basic, Pro, Business : outils annoncés, pas encore livrés.
    "aiChatbot",
    "whatsappAssistant",
    "aiTexts",
    "aiImages",
    "marketingAutomation",
    "advancedCrm",
    "advancedSeo",
    "multilingual",
    "commerce",
    "formation",
    // Anciens packs.
    "advancedBranding",
    "premiumBranding",
    "advancedStats",
    "advancedPresentation",
    "contactForm",
    "businessSections",
    "seoPages",
    "visibilityReport",
    "paymentLinks",
    "qrPoster",
  ] as string[],
  /**
   * Les trois solutions et leur état : « available » (souscription ouverte) ou
   * « soon » (présentée « Disponible bientôt », sans souscription possible).
   */
  solutions: [
    { code: "booking", status: "available" },
    { code: "commerce", status: "soon" },
    { code: "formation", status: "soon" },
  ] as SolutionSetting[],
  /** Adresse d'une démonstration en ligne ; vide : le bouton « Voir la démonstration » est masqué. */
  demo_url: "",
  /**
   * Formule sans engagement proposée à la commande (avec frais de création du pack).
   * false : seule la formule avec engagement (commitment_months), création offerte.
   */
  offer_no_commitment: true as boolean,
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

export type SolutionSetting = { code: "booking" | "commerce" | "formation"; status: "available" | "soon" };

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
  /** Pack proposé à la vente (les anciens packs restent en base pour leurs abonnés). */
  isPublic?: boolean;
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
  gallery: false,
  selfEditing: false,
  advancedBranding: false,
  premiumBranding: false,
  advancedStats: false,
  advancedSeo: false,
  richContent: false,
  advancedPresentation: false,
  prioritySupport: false,
  dedicatedSupport: false,
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
 * Anciens packs (avant la grille Essentiel, Business, Premium) : plus vendus,
 * ils restent en base pour les sites qui y sont abonnés. Le Basic (gratuit)
 * reste le pack d'arrivée des abonnements qui se terminent. null = illimité. Deux familles : avec réservation
 * (Basic, Essentiel, Sérénité) et « site seul » (Express, Vitrine, Signature).
 * Règle des jumeaux : un pack avec réservation comprend tout son pack « site
 * seul » (Vitrine → Essentiel, Signature → Sérénité ; Express → Essentiel).
 */
export const DEFAULT_PLANS: PlanSeed[] = [
  {
    code: "essentiel",
    name: { fr: "Essentiel", en: "Essential", es: "Esencial", ru: "Основной" },
    description: { fr: "Un vrai site à vos couleurs, avec la réservation" },
    priceCents: 3999,
    noCommitmentFeeCents: 14900,
    highlights: ["everythingIn:vitrine", "bookings", "onlinePayment", "sms", "customerSpace", "members"],
    sortOrder: 12,
    isPublic: false,
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
    sortOrder: 13,
    isPublic: false,
    limits: { onlineBookingsPerMonth: null, members: null, photos: null, services: null, smsPerMonth: 300 },
    features: { ...SIGNATURE, ...BOOKING, monthlySummary: true, loyalty: true, aiMessaging: true },
  },
];

/** Anciens packs « site seul » (plus vendus) : un site, sans réservation en ligne. */
export const DEFAULT_SITE_ONLY_PLANS: PlanSeed[] = [
  {
    code: "express",
    name: { fr: "Express", en: "Express", es: "Express", ru: "Экспресс" },
    description: { fr: "Votre vitrine en une page" },
    priceCents: 900,
    noCommitmentFeeCents: 4900,
    bookingTwinCode: "essentiel",
    highlights: ["onePage", "customDomain", "contactButtons", "photosServices", "monthlyUpdate", "hosting"],
    sortOrder: 14,
    isPublic: false,
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
    sortOrder: 15,
    isPublic: false,
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
    sortOrder: 16,
    isPublic: false,
    limits: { onlineBookingsPerMonth: 0, members: null, photos: null, services: null, smsPerMonth: 0 },
    features: SIGNATURE,
  },
];

/**
 * Grille actuelle : Basic (gratuit), Pro et Business. Prix de lancement hors
 * taxes (prices_display « HT »), modifiables dans l'admin ; quotas mensuels
 * (null = illimité, 0 = non inclus). Une fonction annoncée mais pas livrée
 * figure dans features_soon et s'affiche « Disponible bientôt ».
 */
const GRID_BASIC = {
  ...NONE,
  onlineBooking: true,
  customDomain: true,
  mobileReady: true,
  contactButtons: true,
  localSeo: true,
  selfEditing: true,
  gallery: true,
  customerFile: true,
  helpCenter: true,
  emailSupport: true,
  brandingFooter: true,
} satisfies PlanFeatures;

/** Starter : site multipage, paiement par carte, nom de domaine pour la création, assistance WhatsApp. */
const GRID_STARTER = {
  ...GRID_BASIC,
  fullSite: true,
  sitePages: true,
  onlinePayment: true,
  freeDomain: true,
  whatsappSupport: true,
  maintenance: true,
  securityProtection: true,
  logoCreation: true,
  technicalSupport247: true,
} satisfies PlanFeatures;

const GRID_PRO = {
  ...GRID_STARTER,
  brandingFooter: false,
  fullSite: true,
  sitePages: true,
  staffPlanning: true,
  onlinePayment: true,
  promoCodes: true,
  promotions: true,
  testimonials: true,
  customerSpace: true,
  googleReviews: true,
  stats: true,
  ticketSupport: true,
  advancedCrm: false,
  commerce: true,
  formation: true,
} satisfies PlanFeatures;

const GRID_BUSINESS = {
  ...GRID_PRO,
  setupAssistance: true,
  advancedCrm: true,
  marketingAutomation: true,
  loyalty: true,
  giftCards: true,
  monthlySummary: true,
  advancedSeo: true,
  aiChatbot: true,
  whatsappAssistant: true,
  aiTexts: true,
  aiImages: true,
  multilingual: true,
  freeDomain: true,
  priorityHumanSupport: true,
} satisfies PlanFeatures;

/** Aucun outil intelligent (quotas à 0). */
const NO_AI = { aiChatConversations: 0, whatsappConversations: 0, aiTexts: 0, aiImages: 0 };

/** Limites du pack gratuit (hors vente). */
const BASIC_LIMITS = {
  onlineBookingsPerMonth: 10,
  customers: 50,
  members: 1,
  photos: 10,
  services: null,
  smsPerMonth: 0,
  ...NO_AI,
};

export const DEFAULT_GRID_PLANS: PlanSeed[] = [
  {
    // Hors vente : reçoit les sites dont l'abonnement payant se termine (mis en pause).
    code: "basic",
    name: { fr: "Basic", en: "Basic", es: "Basic", ru: "Basic" },
    description: { fr: "L'essentiel pour bien démarrer" },
    priceCents: 0,
    noCommitmentFeeCents: null,
    highlights: [],
    sortOrder: 0,
    isPublic: false,
    limits: BASIC_LIMITS,
    features: GRID_BASIC,
  },
  {
    code: "starter",
    name: { fr: "Starter", en: "Starter", es: "Starter", ru: "Starter" },
    description: { fr: "L'essentiel pour bien démarrer" },
    priceCents: 1999,
    noCommitmentFeeCents: null,
    highlights: [],
    sortOrder: 1,
    isPublic: true,
    limits: { ...BASIC_LIMITS, onlineBookingsPerMonth: null, photos: 50 },
    features: GRID_STARTER,
  },
  {
    code: "pro",
    name: { fr: "Pro", en: "Pro", es: "Pro", ru: "Pro" },
    description: { fr: "Pour développer votre activité" },
    priceCents: 3990,
    noCommitmentFeeCents: null,
    highlights: [],
    sortOrder: 2,
    isPublic: true,
    limits: {
      onlineBookingsPerMonth: null,
      customers: null,
      members: 3,
      photos: null,
      services: null,
      smsPerMonth: 100,
      ...NO_AI,
    },
    features: GRID_PRO,
  },
  {
    code: "business",
    name: { fr: "Business", en: "Business", es: "Business", ru: "Business" },
    description: { fr: "Pour automatiser et piloter votre activité" },
    priceCents: 7900,
    noCommitmentFeeCents: null,
    highlights: [],
    sortOrder: 3,
    isPublic: true,
    limits: {
      onlineBookingsPerMonth: null,
      customers: null,
      members: null,
      photos: null,
      services: null,
      smsPerMonth: 300,
      aiChatConversations: 500,
      whatsappConversations: 200,
      aiTexts: 100,
      aiImages: 20,
    },
    features: GRID_BUSINESS,
  },
];

/**
 * Offre de lancement « tablette offerte » : réglages de départ, modifiables
 * dans l'admin (/admin/offres). Le nombre de places est réel : chaque
 * attribution est enregistrée, l'offre s'arrête d'elle-même une fois complète.
 */
export const DEFAULT_LAUNCH_OFFERS = [
  {
    code: "business-tablet",
    planCode: "business",
    isActive: true,
    quota: 100,
    requiresCommitment: true,
    title: { fr: "Tablette professionnelle offerte" },
    conditions: {
      fr: "Réservée aux 100 premiers abonnés Business éligibles avec engagement de 12 mois. Une tablette par établissement, configurée par nos soins, expédiée après validation du premier paiement et des contrôles d'éligibilité. Livraison en France métropolitaine.",
    },
  },
];

type PlanOptionSeed = {
  code: string;
  name: LocalizedText;
  description: LocalizedText;
  icon: string;
  /** Jamais inventé : null tant que le tarif n'est pas fixé dans l'admin (l'option ne se commande pas). */
  priceCents: number | null;
  isAvailable: boolean;
  features: PlanFeatures;
  limits: PlanLimits;
  requires: string[];
  sortOrder: number;
};

/**
 * Options activables avec n'importe quel pack. Les dépendances (« requires »)
 * sont techniques : le paiement par carte encaisse les acomptes des
 * réservations, les cartes cadeaux se paient par carte, etc.
 */
export const DEFAULT_PLAN_OPTIONS: PlanOptionSeed[] = [
  {
    code: "booking",
    name: { fr: "Réservation en ligne" },
    description: {
      fr: "Vos clients réservent directement sur votre site, 24 h/24, avec confirmations et rappels par e-mail.",
    },
    icon: "calendar",
    priceCents: null,
    isAvailable: true,
    features: { onlineBooking: true, customerSpace: true, promoCodes: true },
    limits: {},
    requires: [],
    sortOrder: 1,
  },
  {
    code: "online-payment",
    name: { fr: "Paiement en ligne" },
    description: { fr: "Encaissez acomptes et paiements par carte bancaire au moment de la réservation." },
    icon: "card",
    priceCents: null,
    isAvailable: true,
    features: { onlinePayment: true },
    limits: {},
    requires: ["booking"],
    sortOrder: 2,
  },
  {
    code: "sms-reminders",
    name: { fr: "Rappels automatiques par SMS" },
    description: { fr: "Réduisez les rendez-vous oubliés : un SMS part automatiquement la veille." },
    icon: "bell",
    priceCents: null,
    isAvailable: true,
    features: {},
    limits: { smsPerMonth: 100 },
    requires: ["booking"],
    sortOrder: 3,
  },
  {
    code: "gift-cards",
    name: { fr: "Cartes cadeaux" },
    description: { fr: "Vendez des cartes cadeaux sur votre site, utilisables en ligne ou sur place." },
    icon: "gift",
    priceCents: null,
    isAvailable: true,
    features: { giftCards: true },
    limits: {},
    requires: ["online-payment"],
    sortOrder: 4,
  },
  {
    code: "loyalty",
    name: { fr: "Programme de fidélité" },
    description: {
      fr: "Récompensez vos clients fidèles avec un compteur de visites et des bons automatiques.",
    },
    icon: "heart",
    priceCents: null,
    isAvailable: true,
    features: { loyalty: true },
    limits: {},
    requires: ["booking"],
    sortOrder: 5,
  },
  {
    code: "google-reviews",
    name: { fr: "Avis Google" },
    description: { fr: "Affichez vos avis Google sur votre site et invitez vos clients à en laisser." },
    icon: "review",
    priceCents: null,
    isAvailable: true,
    features: { googleReviews: true },
    limits: {},
    requires: [],
    sortOrder: 6,
  },
  {
    code: "shop",
    name: { fr: "Boutique en ligne" },
    description: { fr: "Vendez vos produits et services sur internet." },
    icon: "bag",
    priceCents: null,
    isAvailable: false,
    features: {},
    limits: {},
    requires: ["online-payment"],
    sortOrder: 7,
  },
  {
    code: "quotes-invoices",
    name: { fr: "Devis et factures" },
    description: { fr: "Préparez vos devis et factures depuis votre tableau de bord." },
    icon: "document",
    priceCents: null,
    isAvailable: false,
    features: {},
    limits: {},
    requires: [],
    sortOrder: 8,
  },
  {
    code: "business-features",
    name: { fr: "Fonctionnalités métier" },
    description: {
      fr: "Des rubriques adaptées à votre métier : avant/après, zone d'intervention, actualités…",
    },
    icon: "spark",
    priceCents: null,
    isAvailable: false,
    features: { businessSections: true },
    limits: {},
    requires: [],
    sortOrder: 9,
  },
];
