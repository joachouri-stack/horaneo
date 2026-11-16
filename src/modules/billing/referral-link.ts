/**
 * Lien de parrainage : adresse du site commercial + `?parrain=<identifiant du site
 * de la marraine>`. Le code est retenu dans un témoin jusqu'à la commande.
 * Fonctions pures (utilisées aussi par le routage des requêtes, sans base de données).
 */

export const REFERRAL_PARAM = "parrain";
export const REFERRAL_COOKIE = "parrainage";
export const REFERRAL_COOKIE_DAYS = 60;
const CODE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isReferralCode(value: unknown): value is string {
  return typeof value === "string" && CODE.test(value);
}

/** Lien à partager : la page d'accueil du site commercial, avec le code de la marraine. */
export function referralLink(appUrl: string, locale: string, code: string) {
  return `${appUrl}/${locale}?${REFERRAL_PARAM}=${encodeURIComponent(code)}`;
}
