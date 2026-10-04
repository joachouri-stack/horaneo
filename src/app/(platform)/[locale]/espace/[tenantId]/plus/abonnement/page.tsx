import { getTranslations } from "next-intl/server";
import { ui } from "@/components/ui/styles";
import { withTenant } from "@/db/access";
import { usageCounters } from "@/db/schema";
import { pickLocalized } from "@/i18n/locales";
import { managerPage } from "@/lib/manager/page";
import { countUsage } from "@/modules/quotas";
import { currentPeriod } from "@/modules/tenants/queries";
import { and, eq } from "drizzle-orm";

/** Pack, utilisation du mois et limites. */
export default async function SubscriptionPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/abonnement">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.subscription");
  const usage = await withTenant(page.tenantId, async (tx) => {
    const [counter] = await tx
      .select()
      .from(usageCounters)
      .where(
        and(
          eq(usageCounters.tenantId, page.tenantId),
          eq(usageCounters.period, currentPeriod(page.tenant.timezone)),
        ),
      );
    return {
      onlineBookings: counter?.onlineBookings ?? 0,
      sms: counter?.smsSent ?? 0,
      members: await countUsage(tx, page.tenantId, "members"),
      photos: await countUsage(tx, page.tenantId, "photos"),
      services: await countUsage(tx, page.tenantId, "services"),
    };
  });
  const limits = page.tenant.limits;
  const rows = [
    { label: t("onlineBookings"), used: usage.onlineBookings, limit: limits.onlineBookingsPerMonth },
    { label: t("sms"), used: usage.sms, limit: limits.smsPerMonth },
    { label: t("members"), used: usage.members, limit: limits.members },
    { label: t("photos"), used: usage.photos, limit: limits.photos },
    { label: t("services"), used: usage.services, limit: limits.services },
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      <section className={ui.card}>
        <p className="text-xl font-bold text-navy">
          {t("plan", { name: pickLocalized(page.tenant.planName, page.locale) })}
        </p>
        <h2 className="mt-6 font-semibold">{t("usage")}</h2>
        <ul className="mt-2 divide-y divide-navy/10">
          {rows.map((row) => (
            <li key={row.label} className="flex justify-between py-3">
              <span>{row.label}</span>
              <span className="font-semibold">
                {row.limit === null || row.limit === undefined
                  ? `${row.used} · ${t("unlimited")}`
                  : t("of", { used: row.used, limit: row.limit })}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink/70">{t("change")}</p>
      </section>
    </div>
  );
}
