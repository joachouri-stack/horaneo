/**
 * Règle d'accès à l'espace admin :
 * 1. être administratrice (sinon la page « n'existe pas ») ;
 * 2. avoir configuré la double vérification ;
 * 3. avoir saisi un code pour cette session, il y a moins de 12 heures.
 */
export type AdminAccess = "granted" | "not_found" | "setup_required" | "verification_required";

export const ADMIN_VERIFICATION_TTL_MS = 12 * 60 * 60 * 1000;

export function decideAdminAccess(input: {
  isPlatformAdmin: boolean;
  twoFactorConfirmed: boolean;
  sessionVerifiedAt: Date | null;
  now?: Date;
}): AdminAccess {
  if (!input.isPlatformAdmin) return "not_found";
  if (!input.twoFactorConfirmed) return "setup_required";
  const now = input.now ?? new Date();
  if (
    !input.sessionVerifiedAt ||
    now.getTime() - input.sessionVerifiedAt.getTime() > ADMIN_VERIFICATION_TTL_MS
  ) {
    return "verification_required";
  }
  return "granted";
}
