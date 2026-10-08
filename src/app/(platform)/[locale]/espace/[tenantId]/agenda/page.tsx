import { getTranslations } from "next-intl/server";
import { AppointmentCard } from "@/components/manager/AppointmentCard";
import { ui } from "@/components/ui/styles";
import { openingHours } from "@/db/schema";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { dayRange, listAgenda, listTimeOff } from "@/modules/agenda/queries";
import { loadBookingContext } from "@/modules/booking/availability";
import {
  addDays,
  addMonths,
  DATE_PATTERN,
  isoWeekday,
  timeToMinutes,
  utcToLocal,
} from "@/modules/booking/time";
import { eq } from "drizzle-orm";

const HOUR_HEIGHT = 64; // pixels par heure dans la vue jour
const VIEW_PARAM = { day: "jour", week: "semaine", month: "mois" } as const;
const MONTH_PREVIEW = 3; // rendez-vous écrits dans une case du mois (écran large)

/** Nombre de jours entre deux dates AAAA-MM-JJ. */
function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Agenda : vue jour (colonnes par membre), semaine ou mois, filtrable par membre. */
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
  const view = query.vue === "semaine" ? "week" : query.vue === "mois" ? "month" : "day";
  const memberFilter =
    typeof query.membre === "string" && /^[0-9a-f-]{36}$/i.test(query.membre) ? query.membre : null;
  // La semaine commence le lundi. Le mois : semaines entières, du lundi avant le 1er au dimanche après le dernier jour.
  const monthFirst = addMonths(date, 0);
  const monthWeeks = Math.ceil(
    (isoWeekday(monthFirst) - 1 + daysBetween(monthFirst, addMonths(date, 1))) / 7,
  );
  const start =
    view === "week"
      ? addDays(date, 1 - isoWeekday(date))
      : view === "month"
        ? addDays(monthFirst, 1 - isoWeekday(monthFirst))
        : date;
  const days = view === "week" ? 7 : view === "month" ? monthWeeks * 7 : 1;
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
  // Membres désactivés qui ont encore des rendez-vous sur la période : une colonne
  // pour eux aussi, sinon leurs rendez-vous disparaîtraient de la vue Jour.
  const inactive = [
    ...new Map(
      appointments
        .filter((item) => !staff.some((member) => member.id === item.staffId))
        .map((item) => [item.staffId, { id: item.staffId, name: item.staffName, inactive: true }]),
    ).values(),
  ];
  const allColumns = [
    ...staff.map((member) => ({ id: member.id, name: member.name, inactive: false })),
    ...inactive,
  ];
  const columns = memberFilter ? allColumns.filter((member) => member.id === memberFilter) : allColumns;

  const link = (changes: Record<string, string | null>) => {
    const next = { date, vue: VIEW_PARAM[view], membre: memberFilter, ...changes };
    const search = new URLSearchParams(
      Object.entries(next).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    return `${page.base}/agenda?${search.toString()}`;
  };
  const step = view === "week" ? 7 : 1;
  const shift = (direction: 1 | -1) =>
    view === "month" ? addMonths(date, direction) : addDays(date, direction * step);
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
          href={link({ date: shift(-1) })}
          aria-label={t("previous")}
          className={`${pill} border-2 border-navy/15 text-night`}
        >
          ←
        </Link>
        <Link href={link({ date: today })} className={`${pill} border-2 border-navy/15 text-night`}>
          {t("today")}
        </Link>
        <Link
          href={link({ date: shift(1) })}
          aria-label={t("next")}
          className={`${pill} border-2 border-navy/15 text-night`}
        >
          →
        </Link>
        <div className="ml-auto flex rounded-full bg-white p-1 shadow-sm">
          <Link
            href={link({ vue: "jour" })}
            aria-current={view === "day" ? "page" : undefined}
            className={`${pill} text-night aria-[current=page]:bg-navy aria-[current=page]:text-white`}
          >
            {t("day")}
          </Link>
          <Link
            href={link({ vue: "semaine" })}
            aria-current={view === "week" ? "page" : undefined}
            className={`${pill} text-night aria-[current=page]:bg-navy aria-[current=page]:text-white`}
          >
            {t("week")}
          </Link>
          <Link
            href={link({ vue: "mois" })}
            aria-current={view === "month" ? "page" : undefined}
            className={`${pill} text-night aria-[current=page]:bg-navy aria-[current=page]:text-white`}
          >
            {t("month")}
          </Link>
        </div>
      </div>
      {staff.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
          <Link
            href={link({ membre: null })}
            aria-current={!memberFilter ? "page" : undefined}
            className={`${pill} shrink-0 bg-white text-night aria-[current=page]:bg-navy aria-[current=page]:text-white`}
          >
            {t("allStaff")}
          </Link>
          {staff.map((member) => (
            <Link
              key={member.id}
              href={link({ membre: member.id })}
              aria-current={memberFilter === member.id ? "page" : undefined}
              className={`${pill} shrink-0 bg-white text-night aria-[current=page]:bg-navy aria-[current=page]:text-white`}
            >
              {member.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  const dayOffOf = (day: string) =>
    timeOffList.filter(
      (off) =>
        utcToLocal(off.startsAt, tz).date <= day &&
        utcToLocal(new Date(off.endsAt.getTime() - 1), tz).date >= day,
    );

  // ─── Mois : calendrier, une case par jour (le détail s'ouvre en vue jour) ──
  if (view === "month") {
    const gridDays = Array.from({ length: days }, (_, index) => addDays(start, index));
    const month = monthFirst.slice(0, 7);
    const openWeekdays = new Set(hours.map((range) => range.weekday));
    const weekdayName = new Intl.DateTimeFormat(page.locale, { weekday: "short", timeZone: tz });
    const monthName = new Intl.DateTimeFormat(page.locale, { month: "long", year: "numeric", timeZone: tz });
    return (
      <div className="space-y-4">
        {header}
        <h2 className="text-lg font-bold first-letter:uppercase">
          {monthName.format(dayRange(monthFirst, tz).start)}
        </h2>
        <div className="overflow-hidden rounded-[var(--radius-card)] bg-white shadow-sm">
          <div className="grid grid-cols-7 border-b border-navy/10 bg-ivory" aria-hidden="true">
            {gridDays.slice(0, 7).map((day) => (
              <p
                key={day}
                className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-ink/60"
              >
                {weekdayName.format(dayRange(day, tz).start).replace(".", "")}
              </p>
            ))}
          </div>
          <ul className="grid grid-cols-7">
            {gridDays.map((day) => {
              const dayAppointments = appointments.filter(
                (item) => utcToLocal(item.startsAt, tz).date === day,
              );
              const dayOff = dayOffOf(day);
              const outside = day.slice(0, 7) !== month;
              const closed =
                dayAppointments.length === 0 &&
                (!openWeekdays.has(isoWeekday(day)) ||
                  dayOff.some((off) => off.staffId === null && off.kind === "closure"));
              const label = `${page.fmt.day(dayRange(day, tz).start)} · ${t("dayCount", { count: dayAppointments.length })}`;
              return (
                <li key={day} className="border-b border-r border-navy/10 [&:nth-child(7n)]:border-r-0">
                  <Link
                    href={link({ date: day, vue: "jour" })}
                    aria-label={label}
                    className={`flex h-full min-h-16 flex-col gap-1 p-1 transition hover:bg-navy/5 sm:min-h-28 sm:p-2 ${
                      closed ? "bg-ink/[0.04]" : ""
                    } ${outside ? "opacity-40" : ""}`}
                  >
                    <span
                      className={`flex h-7 w-7 items-center justify-center self-center rounded-full text-sm font-bold sm:self-start ${
                        day === today ? "bg-coral text-white" : "text-night"
                      }`}
                    >
                      {Number(day.slice(8))}
                    </span>
                    {/* Téléphone : une pastille par rendez-vous (couleur du membre). */}
                    {dayAppointments.length > 0 && (
                      <span className="flex flex-wrap justify-center gap-0.5 sm:hidden" aria-hidden="true">
                        {dayAppointments.slice(0, 6).map((item) => (
                          <span
                            key={item.id}
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: item.staffColor ?? "#1b2a4a" }}
                          />
                        ))}
                      </span>
                    )}
                    {dayAppointments.length > 6 && (
                      <span
                        className="text-center text-[10px] font-semibold text-ink/60 sm:hidden"
                        aria-hidden="true"
                      >
                        {dayAppointments.length}
                      </span>
                    )}
                    {/* Écran large : les premiers rendez-vous écrits, puis « +N autres ». */}
                    <span className="hidden space-y-1 sm:block" aria-hidden="true">
                      {dayOff.slice(0, 1).map((off) => (
                        <span
                          key={off.id}
                          className="block truncate rounded bg-ink/5 px-1.5 py-0.5 text-[11px] text-ink/60"
                        >
                          {t(`timeOff.${off.kind}`)}
                        </span>
                      ))}
                      {dayAppointments.slice(0, MONTH_PREVIEW).map((item) => (
                        <span
                          key={item.id}
                          className={`block truncate rounded border-l-[3px] bg-navy/5 px-1.5 py-0.5 text-[11px] leading-tight text-night ${
                            item.status === "no_show" ? "opacity-50" : ""
                          }`}
                          style={{ borderLeftColor: item.staffColor ?? "#1b2a4a" }}
                        >
                          <span className="font-semibold">{page.fmt.time(item.startsAt)}</span>{" "}
                          {item.customerName}
                        </span>
                      ))}
                      {dayAppointments.length > MONTH_PREVIEW && (
                        <span className="block px-1.5 text-[11px] font-semibold text-ink/60">
                          {t("more", { count: dayAppointments.length - MONTH_PREVIEW })}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  // ─── Semaine : liste par jour (lisible sur téléphone) ──────────────────────
  if (view === "week") {
    return (
      <div className="space-y-4">
        {header}
        {Array.from({ length: 7 }, (_, index) => addDays(start, index)).map((day) => {
          const dayAppointments = appointments.filter((item) => utcToLocal(item.startsAt, tz).date === day);
          const dayOff = dayOffOf(day);
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
        {/* Une seule colonne (une personne) : elle prend toute la largeur ; plusieurs : défilement. */}
        <div className={`flex ${columns.length === 1 ? "w-full" : "min-w-fit"}`}>
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
            <div
              key={member.id}
              className={`border-l border-navy/10 ${columns.length === 1 ? "min-w-0 flex-1" : "w-44 shrink-0 sm:w-56"}`}
            >
              {member.inactive ? (
                <p className="flex h-10 items-center justify-center gap-1 truncate font-semibold text-ink/60">
                  {member.name} <span className="text-xs font-normal">({t("inactiveStaff")})</span>
                </p>
              ) : (
                <Link
                  href={`${page.base}/rendez-vous/nouveau?date=${date}&membre=${member.id}`}
                  className="flex h-10 items-center justify-center gap-1 truncate font-semibold text-night"
                >
                  {member.name} <span aria-hidden="true">+</span>
                </Link>
              )}
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
                        className={`absolute inset-x-1 z-10 overflow-hidden rounded-md border-l-4 bg-[#eef0f4] p-1 text-xs leading-tight shadow-sm hover:bg-[#e3e6ee] ${item.status === "no_show" ? "opacity-50" : ""}`}
                        style={{ top: from, height: size, borderLeftColor: item.staffColor ?? "#1b2a4a" }}
                      >
                        <span className="block font-bold text-night">
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
