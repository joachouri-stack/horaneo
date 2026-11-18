import { eq } from "drizzle-orm";
import { appointments } from "@/db/schema";

/**
 * Réservation à plusieurs collaboratrices : un rendez-vous par collaboratrice, reliés par
 * l'identifiant du premier (groupId, rempli aussi sur le premier). Un rendez-vous seul n'a
 * pas de groupId : il forme à lui seul sa réservation.
 */

/** Condition « fait partie de la même réservation que ce rendez-vous ». */
export function sameBooking(appointment: { id: string; groupId: string | null }) {
  return appointment.groupId
    ? eq(appointments.groupId, appointment.groupId)
    : eq(appointments.id, appointment.id);
}

/** Premier rendez-vous de la réservation (total, acompte, code promo, lien de gestion, messages). */
export function isLead(appointment: { id: string; groupId: string | null }) {
  return !appointment.groupId || appointment.groupId === appointment.id;
}
