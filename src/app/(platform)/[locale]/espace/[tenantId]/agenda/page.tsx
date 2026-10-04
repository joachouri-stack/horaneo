import { getTranslations } from "next-intl/server";
import { AppointmentCard } from "@/components/manager/AppointmentCard";
import { ui } from "@/components/ui/styles";
import { openingHours } from "@/db/schema";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { dayRange, listAgenda, listTimeOff } from "@/modules/agenda/queries";
import { loadBookingContext } from "@/modules/booking/availability";
import { addDays, DATE_PATTERN, isoWeekday, timeToMinutes, utcToLocal } from "@/modules/booking/time";
import { eq } from "drizzle-orm";

const HOUR_HEIGHT = 64; // pixels par heure dans la vue jour

/** Agenda : vue jour (colonnes par membre) ou semaine, filtrable par membre. */
export default async function AgendaPage({
  params,
  searchParams,
}: PageProps<"/[locale]/espace/[tenantId]/agenda">) {
  const page = await managerPage(params);
  const query = await searchParams;
  const t = await getTranslations("manager.agenda");
  const tz = page.tenant.timezone;
  const today = utcToLocal(new Date(), tz).date;
  const date = typeof query.date === "string" && DATE_PATTERN.test(query.date) ? query.date : today;
  const view = query.vue === "semaine" ? "week" : "day";
  const memberFilter =
    typeof query.membre === "string" && /^[0-9a-f-]{36}$/i.test(query.membre) ? query.membre : null;
  // La semaine commence le lundi.
  const start = view === "week" ? addDays(date, 1 - isoWeekday(date)) : date;
  const days = view === "week" ? 7 : 1;
  const range = dayRange(start, tz, days);

  const { appointments, timeOffList, staff, hours } = await page.db(async (tx) => ({
    appointments: await listAgenda(tx, page.tenantId, {
      from: range.start,
      to: range.end,
      staffId: memberFilter,
      locale: page.locale,
    }),
    timeOffList: await listTimeOff(tx, page.tenantId, range.start, range.end, memberFilter),
    staff: (await loadBookingContext(tx, page.tenantId)).staff,
    hours: await tx.select().from(openingHours).where(eq(openingHours.tenantId, page.tenantId)),
  }));
  const columns = memberFilter ? staff.filter((member) => member.id === memberFilter) : staff;

  const link = (changes: Record<string, string | null>) => {
    const next = { date, vue: view === "week" ? "semaine" : "jour", membre: memberFilter, ...changes };
    const search = new URLSearchParams(
      Object.entries(next).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    return `${page.base}/agenda?${search.toString()}`;
  };
  const step = view === "week" ? 7 : 1;
  const pill = "rounded-full px-4 py-2 text-sm font-semibold";

  const header = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <Link
          href={`${page.base}/rendez-vous/nouveau?date=${date}`}
          aria-label={t("add")}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-coral text-2xl font-bold text-white"
        >
          +
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={link({ date: addDays(date, -step) })}
          aria-label={t("previous")}
          className={`${pill} border-2 border-navy/15 text-navy`}
        >
          ←
        </Link>
        <Link href={link({ date: today })} className={`${pill} border-2 border-navy/15 text-navy`}>
          {t("today")}
        </Link>
        <Link
          href={link({ date: addDays(date, step) })}
          aria-label={t("next")}
          className={`${pill} border-2 border-navy/15 text-navy`}
        >
          →
        </Link>
        <div className="ml-auto flex rounded-full bg-white p-1 shadow-sm">
          <Link
            href={link({ vue: "jour" })}
            aria-current={view === "day" ? "page" : undefined}
            className={`${pill} text-navy aria-[current=page]:bg-navy aria-[current=page]:text-white`}
          >
            {t("day")}
          </Link>
          <Link
            href={link({ vue: "semaine" })}
            aria-current={view === "week" ? "page" : undefined}
            className={`${pill} text-navy aria-[current=page]:bg-navy aria-[current=page]:text-white`}
          >
            {t("week")}
          </Link>
        </div>
      </div>
      {staff.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
          <Link
            href={link({ membre: null })}
            aria-current={!memberFilter ? "page" : undefined}
            className={`${pill} shrink-0 bg-white text-navy aria-[current=page]:bg-navy aria-[current=page]:text-white`}
          >
            {t("allStaff")}
          </Link>
          {staff.map((member) => (
            <Link
              key={member.id}
              href={link({ membre: member.id })}
              aria-current={memberFilter === member.id ? "page" : undefined}
              className={`${pill} shrink-0 bg-white text-navy aria-[current=page]:bg-navy aria-[current=page]:text-white`}
            >
              {member.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  // ─── Semaine : liste par jour (lisible sur téléphone) ──────────────────────
  if (view === "week") {
    return (
      <div className="space-y-4">
        {header}
        {Array.from({ length: 7 }, (_, index) => addDays(start, index)).map((day) => {
          const dayAppointments = appointments.filter((item) => utcToLocal(item.startsAt, tz).date === day);
          const dayOff = timeOffList.filter(
            (off) =>
              utcToLocal(off.startsAt, tz).date <= day &&
              utcToLocal(new Date(off.endsAt.getTime() - 1), tz).date >= day,
          );
          const label = page.fmt.day(dayRange(day, tz).start);
          return (
            <section key={day} aria-label={label} className="space-y-2">
              <h2 className="flex items-baseline justify-between">
                <Link
                  href={link({ date: day, vue: "jour" })}
                  className={`text-lg font-bold first-letter:uppercase ${day === today ? "text-coral-dark" : ""}`}
                >
                  {label}
                </Link>
                <span className="text-sm text-ink/60">{dayAppointments.length}</span>
              </h2>
              {dayOff.map((off) => (
                <p
                  key={off.id}
                  className="rounded-[var(--radius-card)] bg-ink/5 px-4 py-2 text-sm text-ink/70"
                >
                  {t(`timeOff.${off.kind}`)} · {off.staffName ?? ""} {off.reason ? `· ${off.reason}` : ""}
                </p>
              ))}
              {dayAppointments.length === 0 && dayOff.length === 0 ? (
                <p className="text-sm text-ink/50">{t("empty")}</p>
              ) : (
                <ul className="space-y-2">
                  {dayAppointments.map((item) => (
                    <li key={item.id}>
                      <AppointmentCard
                        item={item}
                        href={`${page.base}/rendez-vous/${item.id}`}
                        time={page.fmt.time(item.startsAt)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  // ─── Jour : frise horaire, une colonne par membre ──────────────────────────
  const weekday = isoWeekday(date);
  const dayHours = hours.filter((range) => range.weekday === weekday);
  const minutesOf = (instant: Date) => utcToLocal(instant, tz).minutes;
  const startMinute = Math.min(
    8 * 60,
    ...dayHours.map((range) => timeToMinutes(range.opensAt)),
    ...appointments.map((item) => minutesOf(item.startsAt)),
  );
  const endMinute = Math.max(
    19 * 60,
    ...dayHours.map((range) => timeToMinutes(range.closesAt)),
    ...appointments.map((item) => minutesOf(item.endsAt)),
  );
  const firstHour = Math.floor(startMinute / 60);
  const lastHour = Math.ceil(endMinute / 60);
  const top = (minutes: number) => ((minutes - firstHour * 60) / 60) * HOUR_HEIGHT;
  const height = (lastHour - firstHour) * HOUR_HEIGHT;

  return (
    <div className="space-y-4">
      {header}
      <h2 className="text-lg font-bold first-letter:uppercase">{page.fmt.day(range.start)}</h2>
      {dayHours.length === 0 && appointments.length === 0 && <p className={ui.card}>{t("closed")}</p>}
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex min-w-fit">
          <div
            className="sticky left-0 z-10 w-12 shrink-0 bg-ivory pt-10"
            style={{ height: height + 40 }}
            aria-hidden="true"
          >
            {Array.from({ length: lastHour - firstHour }, (_, index) => (
              <div key={index} className="text-xs text-ink/50" style={{ height: HOUR_HEIGHT }}>
                {String(firstHour + index).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {columns.map((member) => (
            <div key={member.id} className="w-44 shrink-0 border-l border-navy/10 sm:w-56">
              <Link
                href={`${page.base}/rendez-vous/nouveau?date=${date}&membre=${member.id}`}
                className="flex h-10 items-center justify-center gap-1 truncate font-semibold text-navy"
              >
                {member.name} <span aria-hidden="true">+</span>
              </Link>
              <div className="relative bg-white" style={{ height }}>
                {Array.from({ length: lastHour - firstHour }, (_, index) => (
                  <div
                    key={index}
                    className="absolute inset-x-0 border-t border-navy/5"
                    style={{ top: index * HOUR_HEIGHT }}
                  />
                ))}
                {timeOffList
                  .filter((off) => off.staffId === null || off.staffId === member.id)
                  .map((off) => {
                    const from = Math.max(top(minutesOf(off.startsAt)), 0);
                    const to =
                      off.endsAt >= range.end ? height : Math.min(top(minutesOf(off.endsAt)), height);
                    return (
                      <div
                        key={off.id}
                        className="absolute inset-x-1 rounded bg-[repeating-linear-gradient(45deg,#f1eee8,#f1eee8_6px,#e7e2d9_6px,#e7e2d9_12px)] p-1 text-xs text-ink/70"
                        style={{ top: from, height: Math.max(to - from, 16) }}
                      >
                        {t(`timeOff.${off.kind}`)}
                      </div>
                    );
                  })}
                {appointments
                  .filter((item) => item.staffId === member.id)
                  .map((item) => {
                    const from = top(minutesOf(item.startsAt));
                    const size = Math.max(top(minutesOf(item.endsAt)) - from, 28);
                    return (
                      <Link
                        key={item.id}
                        href={`${page.base}/rendez-vous/${item.id}`}
                        className={`absolute inset-x-1 overflow-hidden rounded-md border-l-4 bg-navy/5 p-1 text-xs leading-tight hover:bg-navy/10 ${item.status === "no_show" ? "opacity-50" : ""}`}
                        style={{ top: from, height: size, borderLeftColor: item.staffColor ?? "#1b2a4a" }}
                      >
                        <span className="block font-bold text-navy">
                          {page.fmt.time(item.startsAt)} {item.customerName}
                        </span>
                        <span className="block text-ink/70">{item.services.join(" + ")}</span>
                      </Link>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
