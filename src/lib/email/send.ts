import "server-only";
import { env } from "@/config/env";

/**
 * Envoi d'e-mails.
 * - Avec BREVO_API_KEY : envoi réel par Brevo.
 * - Sans clé, en développement : l'e-mail est affiché dans le terminal.
 * - Pendant les tests : l'e-mail est gardé dans `testOutbox`.
 * - Sans clé, en production : erreur (un e-mail ne doit jamais se perdre en silence).
 */

export type Email = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  fromName?: string;
  replyTo?: string | null;
};

export const testOutbox: Email[] = [];

export async function sendEmail(email: Email): Promise<{ id: string | null }> {
  const config = env();
  const fromName = email.fromName ?? config.PRODUCT_NAME;
  const fromAddress = config.EMAIL_FROM_ADDRESS ?? `no-reply@${config.MAIN_DOMAIN}`;
  const recipients = Array.isArray(email.to) ? email.to : [email.to];

  if (config.NODE_ENV === "test") {
    testOutbox.push(email);
    return { id: null };
  }

  if (!config.BREVO_API_KEY) {
    if (config.NODE_ENV === "production")
      throw new Error("BREVO_API_KEY manquante : impossible d'envoyer l'e-mail.");
    console.info(
      `\n📧 E-mail pour ${recipients.join(", ")} (de « ${fromName} ») — ${email.subject}\n${email.text}\n`,
    );
    return { id: null };
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": config.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromAddress },
      to: recipients.map((address) => ({ email: address })),
      replyTo: email.replyTo ? { email: email.replyTo } : undefined,
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
    }),
  });
  if (!response.ok) {
    throw new Error(`Brevo a refusé l'e-mail (${response.status}) : ${await response.text()}`);
  }
  const body = (await response.json().catch(() => ({}))) as { messageId?: string };
  return { id: body.messageId ?? null };
}
