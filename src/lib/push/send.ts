import "server-only";
import webpush from "web-push";
import { authSecret, env } from "@/config/env";
import type { OutgoingPush } from "@/modules/messages/senders";
import { vapidKeysFrom } from "./vapid";

let cached: ReturnType<typeof vapidKeysFrom> | null = null;

/** Clé publique à donner au navigateur pour qu'il s'abonne. */
export function vapidPublicKey() {
  cached ??= vapidKeysFrom(authSecret());
  return cached.publicKey;
}

/**
 * Envoie une notification à un téléphone ou un ordinateur. Un abonnement
 * disparu (404/410 : application supprimée, notifications coupées) est signalé
 * pour être effacé ; toute autre erreur est relancée (nouvel essai plus tard).
 */
export async function sendPush(message: OutgoingPush): Promise<{ gone: boolean }> {
  cached ??= vapidKeysFrom(authSecret());
  const config = env();
  try {
    await webpush.sendNotification(
      {
        endpoint: message.subscription.endpoint,
        keys: { p256dh: message.subscription.p256dh, auth: message.subscription.auth },
      },
      JSON.stringify({ title: message.title, body: message.body, url: message.url, tag: message.tag }),
      {
        TTL: 24 * 3600,
        urgency: "high",
        vapidDetails: {
          // Contact des services de notifications : la même adresse que la FAQ du site.
          subject: `mailto:${config.SUPPORT_EMAIL ?? `support@${config.MAIN_DOMAIN}`}`,
          publicKey: cached.publicKey,
          privateKey: cached.privateKey,
        },
      },
    );
    return { gone: false };
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return { gone: true };
    throw error;
  }
}
