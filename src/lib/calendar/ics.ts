/**
 * Écriture d'un agenda au format iCalendar (RFC 5545), lu par Google Agenda,
 * le Calendrier de l'iPhone, Outlook… Textes échappés, lignes repliées à 75 octets.
 */

export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  status?: "CONFIRMED" | "TENTATIVE";
  /** Dernière modification (Google et Apple s'en servent pour mettre à jour). */
  updatedAt?: Date;
};

const stamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export const escapeIcsText = (value: string) =>
  value.replace(/[;,\\]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

/** Replie une ligne trop longue (75 octets max), sans couper un caractère accentué. */
export function foldIcsLine(line: string) {
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(input: { name: string; productId: string; events: IcsEvent[]; now?: Date }) {
  const now = stamp(input.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${escapeIcsText(input.productId)}//FR`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(input.name)}`,
    // Demande aux agendas de relire souvent (Apple et Outlook l'appliquent ; Google relit à son rythme).
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];
  for (const event of input.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${now}`,
      ...(event.updatedAt ? [`LAST-MODIFIED:${stamp(event.updatedAt)}`] : []),
      `DTSTART:${stamp(event.start)}`,
      `DTEND:${stamp(event.end)}`,
      `SUMMARY:${escapeIcsText(event.summary)}`,
      ...(event.description ? [`DESCRIPTION:${escapeIcsText(event.description)}`] : []),
      ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
      ...(event.url ? [`URL:${event.url}`] : []),
      `STATUS:${event.status ?? "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
