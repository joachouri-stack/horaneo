import { env } from "@/config/env";
import { appointmentEvent } from "@/lib/calendar/appointment";
import { buildIcs } from "@/lib/calendar/ics";
import { withTokenBusiness } from "@/lib/site/business";
import { getSite } from "@/lib/site/load";
import { tenantSiteUrl } from "@/lib/tenancy/urls";
import { findByManageToken } from "@/modules/booking/manage";
import { SITE_PATHS } from "@/modules/site/paths";

/**
 * Fichier d'agenda d'un rendez-vous (lien de gestion) : l'iPhone, Android et
 * Outlook proposent de l'ajouter à l'agenda, avec l'adresse et le lien du rendez-vous.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/sites/[tenantId]/rendez-vous/[token]/agenda">,
) {
  const { tenantId, token } = await params;
  const site = await getSite(tenantId);
  const managed = await withTokenBusiness(tenantId, token, (tx) =>
    findByManageToken(tx, tenantId, token, site.locale),
  );
  if (!managed || managed.appointment.status === "cancelled" || managed.appointment.status === "expired")
    return new Response(null, { status: 404 });
  const host = site.primaryHostname ?? env().MAIN_DOMAIN;
  const siteUrl = site.primaryHostname ? tenantSiteUrl(site.primaryHostname) : "";
  const tenant = managed.context.tenant;
  const event = appointmentEvent({
    id: managed.appointment.id,
    start: managed.appointment.startsAt,
    end: managed.appointment.endsAt,
    services: managed.items.map((item) => item.name),
    businessName: site.tenant.name,
    address: [tenant.addressLine1, [tenant.postalCode, tenant.city].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", "),
    manageUrl: `${siteUrl}${SITE_PATHS.appointment}/${token}`,
    host,
  });
  return new Response(buildIcs({ name: site.tenant.name, productId: host, events: [event] }), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="rendez-vous.ics"',
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
