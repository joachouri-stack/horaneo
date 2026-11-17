import { z } from "zod";
import type { Transaction } from "@/db/client";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { getSlotsForRange, isOnlineQuotaReached, loadBookingContext } from "@/modules/booking/availability";
import { DATE_PATTERN, utcToLocal } from "@/modules/booking/time";
import { SITE_PATHS } from "@/modules/site/paths";
import type { ChatToolDefinition } from "./model";

/**
 * Outils du chatbot : ce qu'il peut consulter (jamais modifier). Pour l'instant,
 * les créneaux libres d'une prestation, calculés comme sur la page Réserver ;
 * chaque résultat donne aussi un lien de réservation prérempli (prestation et jour).
 */

export const FIND_SLOTS = "find_available_slots";

/** Définition donnée au modèle (schéma strict). */
export const chatTools: ChatToolDefinition[] = [
  {
    name: FIND_SLOTS,
    description:
      "Find free appointment times for one service of this business, starting from a given day. Use it whenever the visitor asks about availability, a free slot, or when they could come. Use the service id from the business information. Returns, for each day, the start times still free.",
    input_schema: {
      type: "object",
      properties: {
        service_id: {
          type: "string",
          description: "Id of the service, as listed in the business information.",
        },
        from_date: {
          type: "string",
          description:
            "First day to search, YYYY-MM-DD (local date). Use today's date if the visitor gave none.",
        },
        days: { type: "integer", description: "Number of days to search, from 1 to 7." },
      },
      required: ["service_id", "from_date", "days"],
      additionalProperties: false,
    },
  },
];

const findSlotsInput = z.object({
  service_id: z.uuid(),
  from_date: z.string().regex(DATE_PATTERN),
  days: z.number().int().min(1).max(7),
});

/** Lien proposé sous la réponse : réserver cette prestation, à partir de ce jour. */
export type BookingLink = { serviceId: string; serviceName: string; date: string; href: string };

/** Créneaux montrés au modèle par jour (les premiers). */
const SLOTS_PER_DAY = 8;

export async function runChatTool(
  tx: Transaction,
  tenantId: string,
  name: string,
  raw: unknown,
  now = new Date(),
): Promise<{ result: string; link: BookingLink | null }> {
  if (name !== FIND_SLOTS) return { result: "Unknown tool.", link: null };
  const parsed = findSlotsInput.safeParse(raw);
  if (!parsed.success)
    return { result: "Invalid input: give a service id from the list and a date YYYY-MM-DD.", link: null };
  const input = parsed.data;
  const context = await loadBookingContext(tx, tenantId);
  const service = context.services.find((item) => item.id === input.service_id);
  if (!service || !service.isOnlineBookable)
    return { result: "This service cannot be booked online. Suggest contacting the business.", link: null };
  if (!context.settings.onlineBookingEnabled || (await isOnlineQuotaReached(tx, context, now)))
    return {
      result: "Online booking is not available right now. Suggest contacting the business.",
      link: null,
    };

  const today = utcToLocal(now, context.tenant.timezone).date;
  const fromDate = input.from_date > today ? input.from_date : today;
  const days = await getSlotsForRange(tx, context, {
    serviceIds: [service.id],
    staffId: null,
    fromDate,
    days: input.days,
    now,
  });
  const free = [...days.entries()].filter(([, slots]) => slots.length > 0);
  const serviceName = pickLocalized(service.name, resolveLocale(context.tenant.defaultLocale));
  if (free.length === 0) {
    return {
      result: `No free time for "${serviceName}" between ${fromDate} and the next ${input.days} day(s). Offer to search later dates.`,
      link: null,
    };
  }
  const lines = free.map(
    ([date, slots]) =>
      `${date}: ${slots
        .slice(0, SLOTS_PER_DAY)
        .map((slot) => slot.time)
        .join(", ")}${slots.length > SLOTS_PER_DAY ? " (more later that day)" : ""}`,
  );
  const first = free[0][0];
  const href = `${SITE_PATHS.booking}?${new URLSearchParams({ prestation: service.id, date: first }).toString()}`;
  return {
    result: [
      `Free times for "${serviceName}" (local time):`,
      ...lines,
      'A "Book" button for this service is shown to the visitor under your reply: tell them to use it to choose the time.',
    ].join("\n"),
    link: { serviceId: service.id, serviceName, date: first, href },
  };
}
