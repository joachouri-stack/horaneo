import "server-only";
import { env } from "@/config/env";
import { sendEmail } from "@/lib/email/send";
import type { MessageSenders, OutgoingSms } from "@/modules/messages/senders";

/**
 * Envoi d'un SMS par Brevo (SMS transactionnels).
 * Sans BREVO_API_KEY : affiché dans le terminal en développement, erreur en production.
 */
async function sendSms(sms: OutgoingSms): Promise<{ id: string | null }> {
  const config = env();
  if (!config.BREVO_API_KEY) {
    if (config.NODE_ENV === "production")
      throw new Error("BREVO_API_KEY manquante : impossible d'envoyer le SMS.");
    console.info(`\n📱 SMS pour ${sms.to} (de « ${sms.sender} ») :\n${sms.text}\n`);
    return { id: null };
  }
  const response = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
    method: "POST",
    headers: {
      "api-key": config.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: sms.sender,
      // Brevo attend le numéro sans le « + » initial.
      recipient: sms.to.replace(/^\+/, ""),
      content: sms.text,
      type: "transactional",
      unicodeEnabled: true,
    }),
  });
  if (!response.ok) {
    throw new Error(`Brevo a refusé le SMS (${response.status}) : ${await response.text()}`);
  }
  const body = (await response.json().catch(() => ({}))) as { messageId?: number | string };
  return { id: body.messageId !== undefined ? String(body.messageId) : null };
}

export const brevoSenders: MessageSenders = {
  email: (message) => sendEmail(message),
  sms: sendSms,
};
