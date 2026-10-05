import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden } from "@/components/admin/fields";
import { TimeOffForm } from "@/components/manager/TimeOffForm";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { loadBookingContext } from "@/modules/booking/availability";
import { utcToLocal } from "@/modules/booking/time";
import { listUpcomingTimeOff } from "@/modules/schedule/time-off";
import { deleteTimeOffAction } from "../actions";

const KINDS = ["block", "leave", "closure"] as const;

/** Congés, créneaux bloqués et fermetures. */
export default async function UnavailabilityPage({
  params,
  searchParams,
}: PageProps<"/[locale]/espace/[tenantId]/indisponibilites">) {
  const page = await managerPage(params);
  const query = await searchParams;
  const kind = KINDS.find((value) => value === query.type) ?? "block";
  const t = await getTranslations("manager.unavailability");
  const tAgenda = await getTranslations("manager.agenda");
  const { staff, upcoming } = await page.db(async (tx) => ({
    staff: (await loadBookingContext(tx, page.tenantId)).staff,
    upcoming: await listUpcomingTimeOff(tx, page.tenantId),
  }));
  const range = (start: Date, end: Date) => {
    const sameDay =
      utcToLocal(start, page.tenant.timezone).date ===
      utcToLocal(new Date(end.getTime() - 1), page.tenant.timezone).date;
    return sameDay
      ? `${page.fmt.short(start)} · ${page.fmt.time(start)} – ${page.fmt.time(end)}`
      : `${page.fmt.short(start)} → ${page.fmt.short(new Date(end.getTime() - 1))}`;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      <div className="flex rounded-full bg-white p-1 shadow-sm">
        {KINDS.map((value) => (
          <Link
            key={value}
            href={`${page.base}/indisponibilites?type=${value}`}
            aria-current={kind === value ? "page" : undefined}
            className="flex-1 rounded-full px-2 py-2 text-center text-sm font-semibold text-night aria-[current=page]:bg-navy aria-[current=page]:text-white"
          >
            {t(value)}
          </Link>
        ))}
      </div>
      <section className={ui.card}>
        <TimeOffForm
          key={kind}
          tenantId={page.tenantId}
          kind={kind}
          staff={staff}
          today={utcToLocal(new Date(), page.tenant.timezone).date}
          timeZone={page.tenant.timezone}
        />
      </section>
      <section aria-labelledby="a-venir" className="space-y-3">
        <h2 id="a-venir" className="text-lg font-bold">
          {t("upcoming")}
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-ink/60">{t("none")}</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-white p-4 shadow-sm"
              >
                <div>
                  <p className="font-semibold">
                    {tAgenda(`timeOff.${item.kind}`)} · {item.staffName ?? t("everyone")}
                  </p>
                  <p className="text-sm text-ink/70">
                    {range(item.startsAt, item.endsAt)}
                    {item.reason ? ` · ${item.reason}` : ""}
                  </p>
                </div>
                <ActionForm
                  action={deleteTimeOffAction}
                  submitLabel={t("remove")}
                  confirm={t("removeConfirm")}
                  variant="danger"
                  className=""
                >
                  <Hidden values={{ tenantId: page.tenantId, id: item.id }} />
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
