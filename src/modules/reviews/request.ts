import { and, eq, gt } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { appointments, businessSettings, businesses, messageLog } from "@/db/schema";
import { queueMessage } from "@/modules/messages/queue";
import { getTenantPlan } from "@/modules/quotas";
import { getPlatformSetting } from "@/modules/settings";

/**
 * Demande d'avis Google après un rendez-vous marqué « venue » : un e-mail à la
 * cliente quelques heures après la fin du rendez-vous, avec le lien direct
 * vers la fiche Google de l'entreprise. Envoyée seulement si la gérante l'a
 * activée, si le pack inclut les avis Google et si la fiche est reliée ; une
 * seule demande par cliente sur la durée réglée.
 */
export async function queueReviewRequest(
  tx: Transaction,
  tenantId: string,
  appointment: { id: string; businessId: string; customerId: string; endsAt: Date; locale: string },
  now = new Date(),
) {
  const { features } = await getTenantPlan(tx, tenantId);
  if (!features.googleReviews) return false;
  const [settings] = await tx
    .select({ enabled: businessSettings.reviewRequestEnabled, placeId: businesses.googlePlaceId })
    .from(businessSettings)
    .innerJoin(businesses, eq(businesses.id, businessSettings.businessId))
    .where(
      and(eq(businessSettings.tenantId, tenantId), eq(businessSettings.businessId, appointment.businessId)),
    );
  if (!settings?.enabled || !settings.placeId) return false;

  const [delayHours, maxAgeDays, cooldownDays] = await Promise.all([
    getPlatformSetting(tx, "review_request_delay_hours"),
    getPlatformSetting(tx, "review_request_max_age_days"),
    getPlatformSetting(tx, "review_request_cooldown_days"),
  ]);
  // Rendez-vous marqué longtemps après : la demande arriverait hors de propos.
  if (now.getTime() - appointment.endsAt.getTime() > maxAgeDays * 86_400_000) return false;

  const since = new Date(now.getTime() - cooldownDays * 86_400_000);
  const [already] = await tx
    .select({ id: messageLog.id })
    .from(messageLog)
    .innerJoin(appointments, eq(appointments.id, messageLog.appointmentId))
    .where(
      and(
        eq(messageLog.tenantId, tenantId),
        eq(messageLog.templateKey, "customer.review_request"),
        eq(appointments.customerId, appointment.customerId),
        gt(messageLog.createdAt, since),
      ),
    )
    .limit(1);
  if (already) return false;

  const sendAt = new Date(Math.max(now.getTime(), appointment.endsAt.getTime() + delayHours * 3_600_000));
  await queueMessage(tx, {
    tenantId,
    template: "customer.review_request",
    appointmentId: appointment.id,
    locale: appointment.locale,
    sendAt,
  });
  return true;
}
