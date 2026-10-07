import type { MessageSenders, OutgoingEmail, OutgoingPush, OutgoingSms } from "@/modules/messages/senders";

/** Faux services d'envoi pour les tests : gardent les messages en mémoire. */
export function createFakeSenders() {
  const emails: OutgoingEmail[] = [];
  const sms: OutgoingSms[] = [];
  const pushes: OutgoingPush[] = [];
  /** Adresses d'abonnement qui n'existent plus chez le service de notifications. */
  const gone = new Set<string>();
  let failures = 0;
  const senders: MessageSenders = {
    async email(message) {
      if (failures > 0) {
        failures -= 1;
        throw new Error("Brevo indisponible");
      }
      emails.push(message);
      return { id: `email-${emails.length}` };
    },
    async sms(message) {
      if (failures > 0) {
        failures -= 1;
        throw new Error("Brevo indisponible");
      }
      sms.push(message);
      return { id: `sms-${sms.length}` };
    },
    async push(message) {
      if (gone.has(message.subscription.endpoint)) return { gone: true };
      pushes.push(message);
      return { gone: false };
    },
  };
  return {
    senders,
    emails,
    sms,
    pushes,
    gone,
    fail(times = 1) {
      failures = times;
    },
    clear() {
      emails.length = 0;
      sms.length = 0;
      pushes.length = 0;
    },
  };
}
