import type { PlanFeatures } from "@/db/schema";

/**
 * Le pack inclut-il la réservation en ligne ? Seuls les packs « site seul »
 * la coupent (`onlineBooking: false`) ; un pack plus ancien, sans ce réglage, l'inclut.
 */
export const planAllowsBooking = (features: PlanFeatures) => features.onlineBooking !== false;
