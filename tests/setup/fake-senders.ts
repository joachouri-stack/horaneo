import type { MessageSenders, OutgoingEmail, OutgoingSms } from "@/modules/messages/senders";

/** Faux services d'envoi pour les tests : gardent les messages en mémoire. */
export function createFakeSenders() {
  const emails: OutgoingEmail[] = [];
  const sms: OutgoingSms[] = [];
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
  };
  return {
    senders,
    emails,
    sms,
    fail(times = 1) {
      failures = times;
    },
    clear() {
      emails.length = 0;
      sms.length = 0;
    },
  };
}
