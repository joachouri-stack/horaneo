/**
 * Services de notification des navigateurs (Chrome/Android, Firefox, Safari/iPhone,
 * Edge/Windows) : seules adresses d'appareils acceptées. Le serveur n'envoie donc
 * jamais de requête vers une autre adresse (réseau interne compris).
 */
export const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  ".push.apple.com",
  ".notify.windows.com",
] as const;

/** Vrai si l'adresse d'un appareil appartient à un service de notification connu. */
export function isPushServiceUrl(value: string) {
  const host = new URL(value).hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((allowed) =>
    allowed.startsWith(".") ? host.endsWith(allowed) : host === allowed,
  );
}
