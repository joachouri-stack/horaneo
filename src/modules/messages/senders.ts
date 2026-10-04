/**
 * Ce dont l'envoi des messages a besoin : un service d'e-mails et un service de SMS.
 * Implémentation réelle (Brevo) : `src/lib/messages/brevo.ts` ; les tests en utilisent une fausse.
 */

export type OutgoingEmail = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  /** Nom affiché comme expéditeur (ex. le nom de l'établissement). */
  fromName: string;
  /** Les réponses de la cliente arrivent directement à l'établissement. */
  replyTo?: string | null;
};

export type OutgoingSms = {
  /** Numéro au format international (+33…). */
  to: string;
  /** Nom affiché comme expéditeur (11 caractères au plus). */
  sender: string;
  text: string;
};

export interface MessageSenders {
  email(message: OutgoingEmail): Promise<{ id: string | null }>;
  sms(message: OutgoingSms): Promise<{ id: string | null }>;
}

/**
 * Expéditeur d'un SMS : le nom de l'établissement, en lettres et chiffres
 * sans accent (contrainte des opérateurs), 11 caractères au plus.
 */
export function smsSenderName(name: string, fallback: string): string {
  const clean = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 11)
      .trim();
  const candidate = clean(name);
  if (candidate.length >= 3 && /[A-Za-z]/.test(candidate)) return candidate;
  return clean(fallback) || "Info";
}
