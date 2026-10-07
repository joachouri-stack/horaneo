import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";
import { queueMessage } from "@/modules/messages/queue";

/**
 * Appareils (téléphone, ordinateur) d'une gérante qui reçoivent les
 * notifications. Un appareil est lié à la personne : il reçoit les alertes de
 * toutes les entreprises qu'elle gère. Table du rôle plateforme.
 */

/** Clé du navigateur (base64url) de la longueur attendue : 65 octets (p256dh), 16 octets (auth). */
const keyOf = (bytes: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]+=*$/)
    .refine((value) => Buffer.from(value, "base64url").length === bytes);

export const deviceInput = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1000),
  keys: z.object({ p256dh: keyOf(65), auth: keyOf(16) }),
});

export type DeviceInput = z.input<typeof deviceInput>;

/** Active les notifications sur cet appareil (ou le rattache à la personne connectée). */
export async function saveDevice(
  tx: Transaction,
  input: { userId: string; device: DeviceInput; userAgent?: string | null },
) {
  const device = deviceInput.parse(input.device);
  const values = {
    userId: input.userId,
    endpoint: device.endpoint,
    p256dh: device.keys.p256dh,
    auth: device.keys.auth,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
  };
  await tx
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { ...values, updatedAt: new Date() } });
}

/** Coupe les notifications sur cet appareil. */
export async function removeDevice(tx: Transaction, input: { userId: string; endpoint: string }) {
  await tx
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, input.userId), eq(pushSubscriptions.endpoint, input.endpoint)));
}

/** Notification d'essai, envoyée à tous les appareils des gérantes de l'entreprise. */
export async function queuePushTest(tx: Transaction, tenantId: string, input: { businessId: string }) {
  await queueMessage(tx, {
    tenantId,
    businessId: input.businessId,
    template: "manager.push_test",
    dedupeKey: null,
  });
}
