import { getTranslations } from "next-intl/server";
import { formatPhone } from "@/modules/phone";
import type { SiteData } from "@/modules/site/data";
import { directionsUrl, formatTime, isoWeekdayIn, osmEmbedUrl } from "@/modules/site/format";

/** Horaires de la semaine, avec le jour en cours mis en évidence. */
export async function OpeningHoursTable({ site }: { site: NonNullable<SiteData> }) {
  const t = await getTranslations("site.practical");
  const tDays = await getTranslations("weekdays");
  const today = isoWeekdayIn(site.tenant.timezone);
  return (
    <table className="w-full text-left">
      <caption className="sr-only">{t("hours")}</caption>
      <tbody>
        {[1, 2, 3, 4, 5, 6, 7].map((day) => {
          const ranges = site.openingHours.filter((range) => range.weekday === day);
          const isToday = day === today;
          return (
            <tr
              key={day}
              className={`border-b border-site-border last:border-b-0 ${isToday ? "font-semibold" : ""}`}
            >
              <th scope="row" className="py-2 pr-4 font-normal">
                {tDays(String(day) as "1")}
                {isToday && <span className="ml-2 text-sm text-site-accent">({t("today")})</span>}
              </th>
              <td className="py-2 text-right text-site-text">
                {ranges.length === 0
                  ? t("closed")
                  : ranges
                      .map(
                        (range) =>
                          `${formatTime(range.opensAt, site.locale)} – ${formatTime(range.closesAt, site.locale)}`,
                      )
                      .join(", ")}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Adresse, itinéraire, téléphone et plan. */
export async function AddressBlock({
  site,
  showMap = false,
}: {
  site: NonNullable<SiteData>;
  showMap?: boolean;
}) {
  const t = await getTranslations("site.practical");
  const tSite = await getTranslations("site");
  const { tenant } = site;
  const cityLine = [tenant.postalCode, tenant.city].filter(Boolean).join(" ");
  const hasAddress = Boolean(tenant.address || cityLine);
  return (
    <div className="space-y-4">
      {hasAddress && (
        <div>
          <h3 className="font-semibold text-site-text">{t("address")}</h3>
          <address className="mt-1 not-italic text-site-muted">
            {tenant.address && <span className="block">{tenant.address}</span>}
            {cityLine && <span className="block">{cityLine}</span>}
          </address>
          <a
            href={directionsUrl([site.tenant.name, tenant.address, cityLine, tenant.country])}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block font-semibold text-site-accent underline"
          >
            {t("directions")} ↗
          </a>
        </div>
      )}
      {(tenant.phone || tenant.email) && (
        <div>
          <h3 className="font-semibold text-site-text">{t("contact")}</h3>
          {tenant.phone && (
            <a
              href={`tel:${tenant.phone}`}
              className="mt-1 block text-site-accent underline"
              aria-label={tSite("callNumber", { phone: formatPhone(tenant.phone) })}
            >
              {formatPhone(tenant.phone)}
            </a>
          )}
          {tenant.email && (
            <a href={`mailto:${tenant.email}`} className="mt-1 block break-all text-site-accent underline">
              {tenant.email}
            </a>
          )}
        </div>
      )}
      {showMap && tenant.latitude !== null && tenant.longitude !== null && (
        <iframe
          title={t("map")}
          src={osmEmbedUrl(tenant.latitude, tenant.longitude)}
          loading="lazy"
          className="h-72 w-full rounded-site border border-site-border"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}
