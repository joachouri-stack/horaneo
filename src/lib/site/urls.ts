import "server-only";
import { publicAppUrl } from "@/config/env";
import { storage } from "@/lib/storage";
import { tenantSiteUrl } from "@/lib/tenancy/urls";
import type { SiteData, SiteImage } from "@/modules/site/data";

/** Adresse publique (principale) du site d'un client. */
export function siteBaseUrl(site: NonNullable<SiteData>): string {
  return site.primaryHostname ? tenantSiteUrl(site.primaryHostname) : publicAppUrl();
}

/**
 * Image d'aperçu quand on partage un lien du site (WhatsApp, Facebook…) :
 * la photo du haut de l'accueil, sinon celle de L'établissement, sinon la
 * première de la galerie, sinon le logo.
 */
export function shareImage(site: NonNullable<SiteData>): SiteImage | null {
  return site.pages.home?.photo ?? site.pages.about?.photo ?? site.gallery[0] ?? site.logo ?? null;
}

/** Adresse absolue d'une image (pour Google et les réseaux sociaux). */
export function absoluteImageUrl(site: NonNullable<SiteData>, image: SiteImage | null): string | null {
  if (!image) return null;
  const url = storage().publicUrl(image.key);
  return url.startsWith("http") ? url : `${siteBaseUrl(site)}${url}`;
}
