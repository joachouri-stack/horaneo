import { and, asc, desc, eq } from "drizzle-orm";
import { planAllowsBooking } from "@/modules/billing/features";
import type { Transaction } from "@/db/client";
import {
  assets,
  businesses,
  businessSettings,
  googleReviews,
  openingHours,
  plans,
  serviceCategories,
  services,
  sitePages,
  staffMembers,
  staffServices,
  tenantDomains,
  tenants,
  testimonials,
  type PlanFeatures,
} from "@/db/schema";
import { pickLocalized, type Locale, type LocalizedText } from "@/i18n/locales";
import type { PageContent, SitePageKey } from "@/modules/content/pages";
import { activePromotionPrices, type ActivePromotion } from "@/modules/promotions/promotions";
import { isDisplayable, placeReviewsUrl } from "@/modules/reviews/google";

/**
 * Toutes les données publiques d'un site client, lues en une fois avec le
 * rôle du tenant (la base ne laisse voir que ses propres données). Les textes
 * sont déjà résolus dans la langue du site.
 */

export type SiteImage = { key: string; width: number | null; height: number | null; alt: string };

export type SiteService = {
  id: string;
  /** Entreprise qui réalise la prestation (site à plusieurs entreprises). */
  businessId: string;
  categoryId: string | null;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  priceFrom: boolean;
  isOnlineBookable: boolean;
  bookOnline: boolean;
  /** Promotion en cours : prix réduit et prix barré (le plus bas des 30 jours précédents). */
  promo: { priceCents: number; referenceCents: number; title: string; endsOn: string } | null;
};

export type SiteCategory = {
  id: string;
  businessId: string;
  name: string;
  slug: string;
  description: string;
  /** Présentation détaillée (ouverture de la catégorie). */
  details: string;
  icon: string | null;
  isFeatured: boolean;
  /** Lien direct dans le menu du site. */
  inMenu: boolean;
  /** Présentée comme une formation : page dédiée, sans liste de tarifs. */
  isTraining: boolean;
  /** Logos de sa page formation (ex. organismes de financement). */
  logos: SiteImage[];
  /** Prix le plus bas de la catégorie (« dès 45 € »). */
  minPriceCents: number;
  services: SiteService[];
};

export type SiteData = Awaited<ReturnType<typeof loadSiteData>>;

export async function loadSiteData(tx: Transaction, tenantId: string, locale?: Locale) {
  const [row] = await tx
    .select({ tenant: tenants, features: plans.features })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.id, tenantId));
  if (!row) return null;
  const { tenant } = row;
  const lang = (locale ?? tenant.defaultLocale) as Locale;
  const text = (value: LocalizedText | null | undefined) => pickLocalized(value, lang);

  const [
    businessRows,
    pageRows,
    categoryRows,
    serviceRows,
    staffRows,
    links,
    testimonialRows,
    hourRows,
    assetRows,
    domainRows,
    reviewRows,
    settingsRows,
  ] = await Promise.all([
    tx
      .select()
      .from(businesses)
      .where(eq(businesses.tenantId, tenantId))
      .orderBy(desc(businesses.isPrimary), asc(businesses.sortOrder), asc(businesses.createdAt)),
    tx.select().from(sitePages).where(eq(sitePages.tenantId, tenantId)),
    tx
      .select()
      .from(serviceCategories)
      .where(eq(serviceCategories.tenantId, tenantId))
      .orderBy(asc(serviceCategories.sortOrder)),
    tx
      .select()
      .from(services)
      .where(and(eq(services.tenantId, tenantId), eq(services.isActive, true)))
      .orderBy(asc(services.sortOrder), asc(services.createdAt)),
    tx
      .select()
      .from(staffMembers)
      .where(and(eq(staffMembers.tenantId, tenantId), eq(staffMembers.isActive, true)))
      .orderBy(asc(staffMembers.sortOrder)),
    tx.select().from(staffServices).where(eq(staffServices.tenantId, tenantId)),
    tx
      .select()
      .from(testimonials)
      .where(and(eq(testimonials.tenantId, tenantId), eq(testimonials.isPublished, true)))
      .orderBy(asc(testimonials.sortOrder), asc(testimonials.createdAt)),
    tx
      .select()
      .from(openingHours)
      .where(eq(openingHours.tenantId, tenantId))
      .orderBy(asc(openingHours.weekday), asc(openingHours.opensAt)),
    tx
      .select()
      .from(assets)
      .where(and(eq(assets.tenantId, tenantId), eq(assets.status, "active")))
      .orderBy(asc(assets.sortOrder), asc(assets.createdAt)),
    tx
      .select()
      .from(tenantDomains)
      .where(and(eq(tenantDomains.tenantId, tenantId), eq(tenantDomains.isPrimary, true))),
    tx.select().from(googleReviews).where(eq(googleReviews.tenantId, tenantId)),
    tx
      .select({
        businessId: businessSettings.businessId,
        giftCardsEnabled: businessSettings.giftCardsEnabled,
        onlineBookingEnabled: businessSettings.onlineBookingEnabled,
      })
      .from(businessSettings)
      .where(eq(businessSettings.tenantId, tenantId)),
  ]);
  const planFeatures = row.features as PlanFeatures;
  // Réservation en ligne : il faut que le pack l'inclue, puis que l'entreprise l'ait laissée ouverte.
  const bookingAllowed = planAllowsBooking(planFeatures);
  const bookingOpen = (businessId: string) =>
    bookingAllowed &&
    (settingsRows.find((item) => item.businessId === businessId)?.onlineBookingEnabled ?? true);
  const promoted = planFeatures.promotions
    ? await activePromotionPrices(tx, tenantId, { timezone: tenant.timezone, locale: lang })
    : new Map<string, ActivePromotion>();

  const image = (assetId: string | null | undefined): SiteImage | null => {
    const asset = assetId ? assetRows.find((item) => item.id === assetId) : undefined;
    return asset
      ? { key: asset.storageKey, width: asset.width, height: asset.height, alt: text(asset.alt) }
      : null;
  };

  const pages = Object.fromEntries(
    pageRows.map((page) => {
      const content = (page.content ?? {}) as PageContent;
      const texts: Record<string, string> = {};
      for (const [field, value] of Object.entries(content)) {
        if (value && typeof value === "object") texts[field] = text(value as LocalizedText);
      }
      return [
        page.pageKey,
        {
          isPublished: page.isPublished,
          texts,
          photo: image((content.coverAssetId ?? content.photoAssetId) as string | undefined),
          seoTitle: text(page.seoTitle),
          seoDescription: text(page.seoDescription),
        },
      ];
    }),
  ) as Partial<
    Record<
      SitePageKey,
      {
        isPublished: boolean;
        texts: Record<string, string>;
        photo: SiteImage | null;
        seoTitle: string;
        seoDescription: string;
      }
    >
  >;

  const siteServices: SiteService[] = serviceRows.map((service) => ({
    id: service.id,
    businessId: service.businessId,
    categoryId: service.categoryId,
    name: text(service.name),
    description: text(service.description),
    durationMinutes: service.durationMinutes,
    priceCents: service.priceCents,
    currency: service.currency,
    priceFrom: service.priceFrom,
    isOnlineBookable: service.isOnlineBookable,
    // Bouton « Réserver » : seulement si l'entreprise prend aussi des rendez-vous en ligne.
    bookOnline: service.isOnlineBookable && bookingOpen(service.businessId),
    promo: (() => {
      const promotion = promoted.get(service.id);
      return promotion
        ? {
            priceCents: promotion.priceCents,
            referenceCents: promotion.referenceCents,
            title: promotion.title,
            endsOn: promotion.endsOn,
          }
        : null;
    })(),
  }));

  const categories: SiteCategory[] = categoryRows
    .map((category) => ({
      id: category.id,
      businessId: category.businessId,
      name: text(category.name),
      slug: text(category.slug),
      description: text(category.description),
      details: text(category.details),
      icon: category.icon,
      isFeatured: category.isFeatured,
      inMenu: category.inMenu,
      isTraining: category.isTraining,
      logos: (category.logoAssetIds ?? []).map((assetId) => image(assetId)).filter((logo) => logo !== null),
      minPriceCents: Math.min(
        ...siteServices
          .filter((service) => service.categoryId === category.id)
          .map((s) => s.promo?.priceCents ?? s.priceCents),
      ),
      services: siteServices.filter((service) => service.categoryId === category.id),
    }))
    .filter((category) => category.services.length > 0 && category.slug);
  const uncategorized = siteServices.filter(
    (service) => !categories.some((category) => category.id === service.categoryId),
  );

  const features = planFeatures;
  // Bandeau « offre du moment » : une ligne par promotion en cours.
  const offers = [...promoted.values()]
    .filter(
      (offer, index, list) => list.findIndex((item) => item.promotionId === offer.promotionId) === index,
    )
    .map((offer) => ({
      id: offer.promotionId,
      title: offer.title,
      endsOn: offer.endsOn,
      businessId: serviceRows.find((service) => promoted.get(service.id)?.promotionId === offer.promotionId)
        ?.businessId,
    }));
  const now = new Date();
  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      status: tenant.status,
      phone: tenant.phone,
      email: tenant.email,
      address: [tenant.addressLine1, tenant.addressLine2].filter(Boolean).join(", "),
      postalCode: tenant.postalCode,
      city: tenant.city,
      country: tenant.country,
      latitude: tenant.latitude,
      longitude: tenant.longitude,
      timezone: tenant.timezone,
      currency: tenant.currency,
      businessCategory: tenant.businessCategory,
      theme: tenant.theme,
      templateKey: tenant.templateKey,
      colors: tenant.brand.colors,
      social: tenant.brand.social ?? {},
      contactBar: tenant.brand.contactBar ?? null,
    },
    locale: lang,
    features: {
      fullSite: Boolean(features.fullSite),
      testimonials: Boolean(features.testimonials),
      brandingFooter: Boolean(features.brandingFooter),
      promotions: Boolean(features.promotions),
      googleReviews: Boolean(features.googleReviews),
      giftCards: Boolean(features.giftCards),
      customerSpace: Boolean(features.customerSpace),
    },
    offers,
    /** Avis Google par entreprise (copie de moins de 30 jours ; sinon seulement le lien). */
    reviews: features.googleReviews
      ? businessRows
          .filter((business) => business.googlePlaceId)
          .map((business) => {
            const cache = reviewRows.find((item) => item.businessId === business.id);
            const fresh =
              cache && cache.placeId === business.googlePlaceId && isDisplayable(cache.fetchedAt, now);
            return {
              businessId: business.id,
              rating: fresh ? cache.rating : null,
              total: fresh ? cache.total : 0,
              reviews: fresh ? cache.reviews.filter((review) => review.text) : [],
              url: (fresh && cache.url) || placeReviewsUrl(business.googlePlaceId!),
            };
          })
      : [],
    /**
     * Entreprises qui vendent des cartes cadeaux en ligne (compte Stripe actif) : les
     * mêmes conditions que la page d'achat, pour ne jamais mener à une impasse.
     * Le site retire ensuite la liste si le paiement en ligne n'est pas configuré.
     */
    giftCardBusinessIds:
      features.giftCards && features.onlinePayment
        ? businessRows
            .filter(
              (business) =>
                business.stripeAccountId &&
                business.stripeChargesEnabled &&
                settingsRows.find((item) => item.businessId === business.id)?.giftCardsEnabled,
            )
            .map((business) => business.id)
        : [],
    /** Au moins une entreprise du site prend des rendez-vous en ligne. */
    bookingEnabled:
      bookingAllowed &&
      (businessRows.length === 0 ||
        settingsRows.some(
          (item) => businessRows.some((b) => b.id === item.businessId) && item.onlineBookingEnabled,
        )),
    primaryHostname: domainRows[0]?.hostname ?? null,
    logo: image(tenant.brand.logoAssetId),
    pages,
    categories,
    uncategorized,
    services: siteServices,
    /** Entreprises du site : nom affiché, identité légale (mentions légales). */
    businesses: businessRows.map((business) => ({
      id: business.id,
      name: business.name,
      legalName: business.legalName,
      siret: business.siret,
      vatNumber: business.vatNumber,
      phone: business.phone,
      email: business.email,
      address: [business.addressLine1, [business.postalCode, business.city].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", "),
      isPrimary: business.isPrimary,
      /** Sa page sur le site (modèle Atelier) : /avec/<slug>. */
      slug: business.slug,
      title: text(business.profile.title),
      role: text(business.profile.role),
      bio: text(business.profile.bio),
      quote: text(business.profile.quote),
      availability: text(business.profile.availability),
      photo: image(business.profile.photoAssetId),
      /** Réservation en ligne ouverte pour cette entreprise (sinon : appeler, écrire). */
      bookingEnabled: bookingOpen(business.id),
    })),
    staff: staffRows.map((member) => ({
      id: member.id,
      businessId: member.businessId,
      name: member.name,
      bio: text(member.bio),
      photo: image(member.photoAssetId),
      serviceIds: links.filter((link) => link.staffId === member.id).map((link) => link.serviceId),
    })),
    testimonials: features.testimonials
      ? testimonialRows.map((item) => ({
          id: item.id,
          authorName: item.authorName,
          text: text(item.text),
          rating: item.rating,
        }))
      : [],
    /** Horaires du lieu : ceux de toutes ses entreprises, sans doublon. */
    openingHours: mergeHours(
      hourRows.map((range) => ({
        weekday: range.weekday,
        opensAt: range.opensAt.slice(0, 5),
        closesAt: range.closesAt.slice(0, 5),
      })),
    ),
    gallery: assetRows
      .filter((asset) => asset.kind === "gallery")
      .map((asset) => ({
        key: asset.storageKey,
        width: asset.width,
        height: asset.height,
        alt: text(asset.alt),
      })),
  };
}

type HourRange = { weekday: number; opensAt: string; closesAt: string };

/** Réunit les plages de plusieurs entreprises : une plage par période d'ouverture du lieu. */
export function mergeHours(ranges: HourRange[]): HourRange[] {
  const merged: HourRange[] = [];
  const sorted = [...ranges].sort((a, b) => a.weekday - b.weekday || a.opensAt.localeCompare(b.opensAt));
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && last.weekday === range.weekday && range.opensAt <= last.closesAt) {
      if (range.closesAt > last.closesAt) last.closesAt = range.closesAt;
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** Pages du menu d'un site complet : seules celles qui ont du contenu (et ne sont pas masquées). */
export function visibleSections(site: NonNullable<SiteData>) {
  if (!site.features.fullSite)
    return { services: false, about: false, gallery: false, testimonials: false, practical: false };
  const published = (key: SitePageKey) => site.pages[key]?.isPublished !== false;
  return {
    services: site.services.length > 0,
    about: published("about") && (Boolean(site.pages.about?.texts.body) || site.staff.length > 0),
    gallery: published("gallery") && site.gallery.length > 0,
    // Page des avis : témoignages saisis, ou avis Google de l'établissement.
    testimonials:
      published("testimonials") &&
      (site.testimonials.length > 0 || site.reviews.some((item) => item.reviews.length > 0)),
    practical: true,
  };
}

/** Site au modèle Atelier (une page par professionnelle) : réservé au site complet. */
export function isAtelier(site: NonNullable<SiteData>) {
  return site.tenant.templateKey === "atelier" && site.features.fullSite;
}

/** Petite photo du haut de l'accueil Atelier : celle de la page L'établissement, sinon la première de la galerie. */
export function heroSecondPhoto(site: NonNullable<SiteData>) {
  return site.pages.about?.photo ?? site.gallery[0] ?? null;
}

/**
 * Photos de « L'institut » (accueil et page L'établissement) : les deux dernières de la galerie
 * qui ne sont pas déjà en haut de l'accueil ni sur les cartes des professionnelles.
 * À défaut, la photo de la page L'établissement.
 */
export function institutePhotos(site: NonNullable<SiteData>): SiteImage[] {
  const shown = new Set(
    [site.pages.home?.photo, heroSecondPhoto(site), ...site.businesses.map((business) => business.photo)].map(
      (photo) => photo?.key,
    ),
  );
  const fresh = [...site.gallery].reverse().filter((photo) => !shown.has(photo.key));
  return (fresh.length > 0 ? fresh : [site.pages.about?.photo]).filter((photo) => photo != null).slice(0, 2);
}

/** Avis Google affichés pour tout le site : ceux de l'entreprise principale, sinon de la première fiche. */
export function siteReviews(site: NonNullable<SiteData>) {
  const primary = site.businesses.find((business) => business.isPrimary);
  return (
    site.reviews.find((item) => item.businessId === primary?.id) ??
    site.reviews.find((item) => item.rating !== null) ??
    site.reviews[0] ??
    null
  );
}
