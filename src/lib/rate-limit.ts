/**
 * Limitation simple du nombre de tentatives, en mémoire du serveur
 * (suffisant tant que l'application tourne sur un seul serveur).
 */
export function createRateLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  return {
    /** Enregistre une tentative ; renvoie false si la limite est dépassée. */
    attempt(key: string, now: number = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 10_000) hits.delete(hits.keys().next().value!);
      return true;
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
