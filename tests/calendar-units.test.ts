import { describe, expect, it } from "vitest";
import { calendarFeedToken, readCalendarFeedToken } from "@/lib/calendar/feed-token";
import { buildIcs, escapeIcsText, foldIcsLine } from "@/lib/calendar/ics";

const TENANT = "11111111-1111-4111-8111-111111111111";
const BUSINESS = "22222222-2222-4222-8222-222222222222";

describe("lien d'agenda", () => {
  it("se relit, avec ou sans « .ics », et refuse un lien modifié", () => {
    const token = calendarFeedToken({ tenantId: TENANT, businessId: BUSINESS, version: 3 });
    expect(readCalendarFeedToken(token)).toEqual({ tenantId: TENANT, businessId: BUSINESS, version: 3 });
    expect(readCalendarFeedToken(`${token}.ics`)).toEqual({
      tenantId: TENANT,
      businessId: BUSINESS,
      version: 3,
    });
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(`${TENANT}.${BUSINESS}.4`).toString("base64url");
    expect(readCalendarFeedToken(`${forged}.${signature}`)).toBeNull();
    expect(readCalendarFeedToken(`${payload}.${signature.slice(1)}x`)).toBeNull();
    expect(readCalendarFeedToken("n'importe quoi")).toBeNull();
    expect(
      readCalendarFeedToken(calendarFeedToken({ tenantId: TENANT, businessId: BUSINESS, version: 0 })),
    ).toBeNull();
  });
});

describe("format iCalendar", () => {
  it("échappe les caractères spéciaux et replie les longues lignes sans couper un accent", () => {
    expect(escapeIcsText("Soin, visage; teint\\éclat\nligne 2")).toBe(
      "Soin\\, visage\\; teint\\\\éclat\\nligne 2",
    );
    const folded = foldIcsLine(`SUMMARY:${"é".repeat(60)}`);
    for (const line of folded.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(
      folded
        .split("\r\n")
        .map((line, i) => (i === 0 ? line : line.slice(1)))
        .join(""),
    ).toBe(`SUMMARY:${"é".repeat(60)}`);
  });

  it("produit un agenda complet, lignes terminées par CRLF", () => {
    const ics = buildIcs({
      name: "Laïla · Horaneo",
      productId: "Horaneo",
      now: new Date("2026-10-05T07:00:00Z"),
      events: [
        {
          uid: "abc@horaneo.com",
          start: new Date("2026-10-06T08:00:00Z"),
          end: new Date("2026-10-06T09:00:00Z"),
          summary: "Camille Martin · Massage",
          description: "Avec Léa\n06 12 34 56 78",
          status: "TENTATIVE",
        },
      ],
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:Laïla · Horaneo\r\n");
    expect(ics).toContain("DTSTART:20261006T080000Z\r\nDTEND:20261006T090000Z\r\n");
    expect(ics).toContain("DESCRIPTION:Avec Léa\\n06 12 34 56 78\r\n");
    expect(ics).toContain("STATUS:TENTATIVE\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
