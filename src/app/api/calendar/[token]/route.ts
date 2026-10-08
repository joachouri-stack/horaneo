import { eq } from "drizzle-orm";
import { env, publicAppUrl } from "@/config/env";
import { withTenant } from "@/db/access";
import { businesses, tenants } from "@/db/schema";
import { getTranslator, resolveLocale } from "@/i18n/translator";
import { readCalendarFeedToken } from "@/lib/calendar/feed-token";
import { buildIcs } from "@/lib/calendar/ics";
import { calendarFeedAppointments } from "@/modules/agenda/calendar-feed";
import { formatPhone } from "@/modules/phone";

/**
 * Agenda d'une entreprise au format iCalendar, relu automatiquement par le
 * téléphone de la gérante. Lien secret ; un lien remplacé ou désactivé ne
 * renvoie plus rien.
 */
export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(_request: Request, { params }: RouteContext<"/api/calendar/[token]">) {
  const token = readCalendarFeedToken((await params).token);
  if (!token) return notFound();
  const config = env();
  const feed = await withTenant(
    token.tenantId,
    async (tx) => {
      const [row] = await tx
        .select({ tenant: tenants, businessName: businesses.name })
        .from(businesses)
        .innerJoin(tenants, eq(tenants.id, businesses.tenantId))
        .where(eq(businesses.id, token.businessId));
      if (!row) return null;
      const locale = resolveLocale(row.tenant.defaultLocale);
      const appointments = await calendarFeedAppointments(tx, token.tenantId, {
        version: token.version,
        locale,
      });
      return appointments && { row, locale, appointments };
    },
    undefined,
    token.businessId,
  ).catch(() => null);
  if (!feed) return notFound();

  const t = await getTranslator(feed.locale);
  const { row } = feed;
  const base = `${publicAppUrl()}/${feed.locale}/espace/${token.tenantId}/rendez-vous`;
  const ics = buildIcs({
    name: t("manager.calendarFeed.ics.name", { product: config.PRODUCT_NAME, business: row.businessName }),
    productId: config.PRODUCT_NAME,
    events: feed.appointments.map((a) => {
      const state =
        a.status === "pending_payment"
          ? ` (${t("manager.calendarFeed.ics.pending")})`
          : a.status === "no_show"
            ? ` (${t("manager.calendarFeed.ics.noShow")})`
            : "";
      const services = a.services.join(" + ");
      return {
        uid: `${a.id}@${config.MAIN_DOMAIN}`,
        start: a.startsAt,
        end: a.endsAt,
        summary: `${a.customerName}${services ? ` · ${services}` : ""}${state}`,
        description: [
          t("manager.calendarFeed.ics.with", { name: a.staffName }),
          ...(a.customerPhone ? [formatPhone(a.customerPhone, row.tenant.country)] : []),
          ...(a.customerNote ? [a.customerNote] : []),
          `${base}/${a.id}`,
        ].join("\n"),
        url: `${base}/${a.id}`,
        status: a.status === "pending_payment" ? ("TENTATIVE" as const) : ("CONFIRMED" as const),
      };
    }),
  });
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": 'inline; filename="agenda.ics"',
    },
  });
}
