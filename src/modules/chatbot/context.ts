import { and, asc, eq } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { openingHours, products } from "@/db/schema";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { loadBookingContext } from "@/modules/booking/availability";

/**
 * Informations de l'établissement données au chatbot, relues à chaque question :
 * un prix, un horaire ou une prestation modifiés par la gérante sont pris en
 * compte tout de suite. Seules des informations déjà publiques (affichées sur le
 * site) y figurent : jamais de données des clients.
 */

const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function money(cents: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

function hhmm(value: string) {
  return value.slice(0, 5);
}

export async function chatbotFacts(tx: Transaction, tenantId: string) {
  const context = await loadBookingContext(tx, tenantId);
  const { tenant, business, settings } = context;
  // Langue du site : celle des noms de prestations et du format des prix.
  const locale = resolveLocale(tenant.defaultLocale);
  const currency = tenant.currency;
  const hours = await tx
    .select()
    .from(openingHours)
    .where(and(eq(openingHours.tenantId, tenantId), eq(openingHours.businessId, business.id)))
    .orderBy(asc(openingHours.weekday), asc(openingHours.opensAt));
  const shop = context.features.commerce
    ? await tx
        .select()
        .from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)))
        .orderBy(asc(products.sortOrder))
        .limit(60)
    : [];

  const lines: string[] = [];
  lines.push(`Business name: ${business.name || tenant.name}`);
  const address = [
    business.addressLine1 ?? tenant.addressLine1,
    business.postalCode ?? tenant.postalCode,
    business.city ?? tenant.city,
  ]
    .filter(Boolean)
    .join(", ");
  if (address) lines.push(`Address: ${address}`);
  const phone = business.phone ?? tenant.phone;
  if (phone) lines.push(`Phone: ${phone}`);
  const email = business.email ?? tenant.email;
  if (email) lines.push(`Email: ${email}`);

  lines.push("", "Opening hours (local time):");
  if (hours.length === 0) lines.push("- Not provided.");
  for (let day = 1; day <= 7; day += 1) {
    const ranges = hours.filter((row) => row.weekday === day);
    if (hours.length > 0)
      lines.push(
        `- ${WEEKDAYS[day]}: ${ranges.length ? ranges.map((row) => `${hhmm(row.opensAt)}–${hhmm(row.closesAt)}`).join(", ") : "closed"}`,
      );
  }

  lines.push("", "Services (name — duration — price):");
  if (context.services.length === 0) lines.push("- None listed.");
  for (const service of context.services) {
    const price =
      service.priceCents === null || service.priceCents === undefined
        ? "price on request"
        : money(service.priceCents, currency, locale);
    const promo =
      service.promotion &&
      service.regularPriceCents !== service.priceCents &&
      service.regularPriceCents != null
        ? ` (promotion, usual price ${money(service.regularPriceCents, currency, locale)})`
        : "";
    const description = service.description ? ` — ${pickLocalized(service.description, locale)}` : "";
    lines.push(
      `- ${pickLocalized(service.name, locale)} — ${service.durationMinutes} min — ${price}${promo}${service.isOnlineBookable ? "" : " — not bookable online (call the business)"}${description}`,
    );
  }

  if (context.staff.length > 0) {
    lines.push("", `Team: ${context.staff.map((member) => member.name).join(", ")}`);
  }

  lines.push("", "Booking rules:");
  lines.push(
    `- Online booking: ${settings.onlineBookingEnabled ? "available on the website" : "not available, contact the business"}`,
  );
  lines.push(`- Free cancellation up to ${settings.cancellationDeadlineHours} hours before the appointment.`);
  if (settings.depositEnabled) {
    lines.push(
      `- A deposit is required when booking online: ${settings.depositType === "percent" ? `${settings.depositValue}% of the price` : money(settings.depositValue, currency, locale)}.`,
    );
  }

  if (shop.length > 0) {
    lines.push("", "Products sold in the online shop (name — price):");
    for (const product of shop) {
      lines.push(`- ${pickLocalized(product.name, locale)} — ${money(product.priceCents, currency, locale)}`);
    }
  }
  return {
    text: lines.join("\n"),
    businessName: business.name || tenant.name,
    timezone: tenant.timezone,
    locale,
  };
}
