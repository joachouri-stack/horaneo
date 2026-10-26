import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { DASH_ICONS, DashIcon } from "@/components/manager/DashboardWidgets";
import { DayTimeline, initials } from "@/components/manager/DayTimeline";
import { openingHours, staffMembers } from "@/db/schema";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { layoutLanes } from "@/modules/agenda/lanes";
import { dayRange, listAgenda, listTimeOff, type AgendaAppointment } from "@/modules/agenda/queries";
import { loadBookingContext } from "@/modules/booking/availability";
import {
  addDays,
  addMonths,
  DATE_PATTERN,
  isoWeekday,
  timeToMinutes,
  utcToLocal,
} from "@/modules/booking/time";

const HOUR_HEIGHT = 72; // pixels par heure dans les vues jour et semaine
const VIEW_PARAM = { day: "jour", week: "semaine", month: "mois" } as const;
const MONTH_PREVIEW = 3; // rendez-vous écrits dans une case du mois (écran large)
const DEFAULT_COLOR = "#3a4bb8";

/** Nombre de jours entre deux dates AAAA-MM-JJ. */
function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Fond teinté d'un rendez-vous : la couleur du membre, très éclaircie. */
const tint = (color: string | null, percent = 14) =>
  `color-mix(in srgb, ${color ?? DEFAULT_COLOR} ${percent}%, white)`;

type GridColumn = {
  key: string;
  header: ReactNode;
  appointments: AgendaAppointment[];
  timeOff: { id: string; kind: string; from: number; to: number }[];
  /** Plages fermées (minutes depuis minuit), grisées. */
  closed: { from: number; to: number }[];
};

/**
 * Agenda : vue jour (une colonne par membre), semaine (sept colonnes sur
 * ordinateur, liste par jour sur téléphone) ou mois, filtrable par membre.
 */
export default async function AgendaPage({
  params,
  searchParams,
}: PageProps<"/[locale]/espace/[tenantId]/agenda">) {
  const page = await managerPage(params);
  const query = await searchParams;
  const t = await getTranslations("manager.agenda");
  const tz = page.tenant.timezone;
  const now = new Date();
  const today = utcToLocal(now, tz).date;
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

  const { appointments, timeOffList, staff, hours, colors } = await page.db(async (tx) => ({
    appointments: await listAgenda(tx, page.tenantId, {
      from: range.start,
      to: range.end,
      staffId: memberFilter,
      locale: page.locale,
    }),
    timeOffList: await listTimeOff(tx, page.tenantId, range.start, range.end, memberFilter),
    staff: (await loadBookingContext(tx, page.tenantId)).staff,
    hours: await tx.select().from(openingHours).where(eq(openingHours.tenantId, page.tenantId)),
    // Couleur de chaque membre (en-têtes de colonnes et filtres).
    colors: new Map(
      (
        await tx
          .select({ id: staffMembers.id, color: staffMembers.color })
          .from(staffMembers)
          .where(eq(staffMembers.tenantId, page.tenantId))
      ).map((row) => [row.id, row.color]),
    ),
  }));
  // Membres désactivés qui ont encore des rendez-vous sur la période : une colonne
  // pour eux aussi, sinon leurs rendez-vous disparaîtraient de la vue Jour.
  const inactive = [
    ...new Map(
      appointments
        .filter((item) => !staff.some((member) => member.id === item.staffId))
        .map((item) => [
          item.staffId,
          { id: item.staffId, name: item.staffName, color: item.staffColor, inactive: true },
        ]),
    ).values(),
  ];
  const allColumns = [
    ...staff.map((member) => ({
      id: member.id,
      name: member.name,
      color: colors.get(member.id) ?? null,
      inactive: false,
    })),
    ...inactive,
  ];
  const members = memberFilter ? allColumns.filter((member) => member.id === memberFilter) : allColumns;

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
  const instant = (day: string) => dayRange(day, tz).start;
  const fmt = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(page.locale, { ...options, timeZone: tz });
  const weekEnd = addDays(start, 6);
  const title =
    view === "month"
      ? fmt({ month: "long", year: "numeric" }).format(instant(monthFirst))
      : view === "week"
        ? fmt({ day: "numeric", month: "long" }).formatRange(instant(start), instant(weekEnd))
        : page.fmt.day(instant(date));

  const iconButton =
    "flex size-11 items-center justify-center rounded-xl border border-hairline bg-white text-night transition hover:border-accent-line hover:text-accent";
  const segment =
    "flex min-h-10 items-center rounded-lg px-3.5 text-[0.9375rem] font-medium text-ink-soft transition hover:text-night aria-[current=page]:bg-white aria-[current=page]:text-night aria-[current=page]:shadow-[0_1px_3px_rgba(15,24,48,.12)]";

  const header = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
            {t("title")}
          </h1>
          <p className="text-ink-soft first-letter:uppercase">{title}</p>
        </div>
        <Link
          href={`${page.base}/rendez-vous/nouveau?date=${date}`}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-[0.95rem] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_12px_26px_-16px_var(--color-accent)] transition hover:bg-accent-strong sm:px-5"
        >
          <DashIcon d={DASH_ICONS.plus} className="h-5 w-5" />
          <span>{t("newAppointment")}</span>
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={link({ date: shift(-1) })} aria-label={t("previous")} className={iconButton}>
          <DashIcon d="M15 6l-6 6 6 6" className="h-5 w-5" />
        </Link>
        <Link
          href={link({ date: today })}
          className="flex min-h-11 items-center rounded-xl border border-hairline bg-white px-4 text-[0.9375rem] font-medium text-night transition hover:border-accent-line hover:text-accent"
        >
          {t("today")}
        </Link>
        <Link href={link({ date: shift(1) })} aria-label={t("next")} className={iconButton}>
          <DashIcon d="M9 6l6 6-6 6" className="h-5 w-5" />
        </Link>
        <div className="ml-auto flex rounded-xl bg-[#eceff5] p-1">
          {(["day", "week", "month"] as const).map((value) => (
            <Link
              key={value}
              href={link({ vue: VIEW_PARAM[value] })}
              aria-current={view === value ? "page" : undefined}
              className={segment}
            >
              {t(value)}
            </Link>
          ))}
        </div>
      </div>
      {staff.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <Link
            href={link({ membre: null })}
            aria-current={!memberFilter ? "page" : undefined}
            className="flex min-h-10 shrink-0 items-center rounded-full border border-hairline bg-white px-4 text-[0.9375rem] font-medium text-night aria-[current=page]:border-night aria-[current=page]:bg-night aria-[current=page]:text-white"
          >
            {t("allStaff")}
          </Link>
          {allColumns
            .filter((member) => !member.inactive)
            .map((member) => (
              <Link
                key={member.id}
                href={link({ membre: member.id })}
                aria-current={memberFilter === member.id ? "page" : undefined}
                className="flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-hairline bg-white py-1 pl-1.5 pr-4 text-[0.9375rem] font-medium text-night aria-[current=page]:border-night aria-[current=page]:bg-night aria-[current=page]:text-white"
              >
                <span
                  aria-hidden="true"
                  className="flex size-7 items-center justify-center rounded-full text-[0.8125rem] font-semibold text-white"
                  style={{ backgroundColor: member.color ?? DEFAULT_COLOR }}
                >
                  {initials(member.name)}
                </span>
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
  const onDay = (day: string) => appointments.filter((item) => utcToLocal(item.startsAt, tz).date === day);

  // ─── Mois : calendrier, une case par jour (le détail s'ouvre en vue jour) ──
  if (view === "month") {
    const gridDays = Array.from({ length: days }, (_, index) => addDays(start, index));
    const month = monthFirst.slice(0, 7);
    const openWeekdays = new Set(hours.map((range) => range.weekday));
    const weekdayName = fmt({ weekday: "short" });
    return (
      <div className="space-y-5">
        {header}
        <div className="overflow-hidden rounded-[1.4rem] border border-hairline bg-white">
          <div className="grid grid-cols-7 border-b border-hairline bg-mist-50" aria-hidden="true">
            {gridDays.slice(0, 7).map((day) => (
              <p
                key={day}
                className="py-2.5 text-center text-[0.8125rem] font-medium uppercase tracking-[0.06em] text-ink-soft"
              >
                {weekdayName.format(instant(day)).replace(".", "")}
              </p>
            ))}
          </div>
          <ul className="grid grid-cols-7">
            {gridDays.map((day) => {
              const dayAppointments = onDay(day);
              const dayOff = dayOffOf(day);
              const outside = day.slice(0, 7) !== month;
              const closed =
                dayAppointments.length === 0 &&
                (!openWeekdays.has(isoWeekday(day)) ||
                  dayOff.some((off) => off.staffId === null && off.kind === "closure"));
              const label = `${page.fmt.day(instant(day))} · ${t("dayCount", { count: dayAppointments.length })}`;
              return (
                <li key={day} className="border-b border-r border-hairline [&:nth-child(7n)]:border-r-0">
                  <Link
                    href={link({ date: day, vue: "jour" })}
                    aria-label={label}
                    className={`flex h-full min-h-16 flex-col gap-1 p-1 transition hover:bg-accent-soft/50 sm:min-h-28 sm:p-2 ${
                      closed
                        ? "bg-[repeating-linear-gradient(45deg,#fafbfd,#fafbfd_6px,#f3f5f9_6px,#f3f5f9_12px)]"
                        : ""
                    } ${outside ? "opacity-40" : ""}`}
                  >
                    <span
                      className={`flex size-7 items-center justify-center self-center rounded-full text-sm font-medium tabular-nums sm:self-start ${
                        day === today ? "bg-accent text-white" : "text-night"
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
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: item.staffColor ?? DEFAULT_COLOR }}
                          />
                        ))}
                      </span>
                    )}
                    {dayAppointments.length > 6 && (
                      <span
                        className="text-center text-[10px] font-medium text-ink-soft sm:hidden"
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
                          className="block truncate rounded-md bg-[#f1f2f5] px-1.5 py-0.5 text-[11px] text-ink-soft"
                        >
                          {t(`timeOff.${off.kind}`)}
                        </span>
                      ))}
                      {dayAppointments.slice(0, MONTH_PREVIEW).map((item) => (
                        <span
                          key={item.id}
                          className={`block truncate rounded-md border-l-[3px] px-1.5 py-0.5 text-[11px] leading-tight text-night ${
                            item.status === "no_show" ? "opacity-50" : ""
                          }`}
                          style={{
                            borderLeftColor: item.staffColor ?? DEFAULT_COLOR,
                            backgroundColor: tint(item.staffColor),
                          }}
                        >
                          <span className="font-semibold tabular-nums">{page.fmt.time(item.startsAt)}</span>{" "}
                          {item.customerName}
                        </span>
                      ))}
                      {dayAppointments.length > MONTH_PREVIEW && (
                        <span className="block px-1.5 text-[11px] font-medium text-accent">
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

  // ─── Frise horaire commune aux vues jour et semaine ────────────────────────
  const minutesOf = (date: Date) => utcToLocal(date, tz).minutes;
  const hoursOf = (day: string) => hours.filter((range) => range.weekday === isoWeekday(day));
  const visibleDays = Array.from({ length: days }, (_, index) => addDays(start, index));
  const relevantHours = visibleDays.flatMap(hoursOf);
  const startMinute = Math.min(
    8 * 60,
    ...relevantHours.map((range) => timeToMinutes(range.opensAt)),
    ...appointments.map((item) => minutesOf(item.startsAt)),
  );
  const endMinute = Math.max(
    19 * 60,
    ...relevantHours.map((range) => timeToMinutes(range.closesAt)),
    ...appointments.map((item) => minutesOf(item.endsAt)),
  );
  const firstHour = Math.floor(startMinute / 60);
  const lastHour = Math.ceil(endMinute / 60);
  const top = (minutes: number) => ((minutes - firstHour * 60) / 60) * HOUR_HEIGHT;
  const height = (lastHour - firstHour) * HOUR_HEIGHT;
  const nowMinute = minutesOf(now);

  /** Plages hors horaires d'ouverture d'un jour (grisées), en minutes. */
  const closedOf = (day: string) => {
    const open = hoursOf(day)
      .map((range) => ({ from: timeToMinutes(range.opensAt), to: timeToMinutes(range.closesAt) }))
      .sort((a, b) => a.from - b.from);
    if (open.length === 0) return [{ from: firstHour * 60, to: lastHour * 60 }];
    const gaps: { from: number; to: number }[] = [];
    let cursor = firstHour * 60;
    for (const range of open) {
      if (range.from > cursor) gaps.push({ from: cursor, to: range.from });
      cursor = Math.max(cursor, range.to);
    }
    if (cursor < lastHour * 60) gaps.push({ from: cursor, to: lastHour * 60 });
    return gaps;
  };
  const timeOffOf = (day: string, memberId: string | null) => {
    const { start: dayStart, end: dayEnd } = dayRange(day, tz);
    return dayOffOf(day)
      .filter((off) => memberId === null || off.staffId === null || off.staffId === memberId)
      .map((off) => ({
        id: off.id,
        kind: off.kind,
        from: off.startsAt <= dayStart ? firstHour * 60 : minutesOf(off.startsAt),
        to: off.endsAt >= dayEnd ? lastHour * 60 : minutesOf(off.endsAt),
      }));
  };

  const grid = (columns: GridColumn[], options: { nowColumn: string | null; wide: boolean }) => (
    <div className="overflow-hidden rounded-[1.4rem] border border-hairline bg-white">
      <div className="overflow-x-auto">
        <div className={`flex ${options.wide ? "min-w-fit" : "w-full"}`}>
          {/* Heures. */}
          <div
            className="sticky left-0 z-20 w-14 shrink-0 border-r border-hairline bg-white"
            aria-hidden="true"
          >
            <div className="h-14 border-b border-hairline" />
            <div className="relative" style={{ height }}>
              {Array.from({ length: lastHour - firstHour }, (_, index) => (
                <span
                  key={index}
                  className="absolute right-2 -translate-y-1/2 text-[0.8125rem] text-ink-soft tabular-nums first:translate-y-0"
                  style={{ top: index * HOUR_HEIGHT + (index === 0 ? 4 : 0) }}
                >
                  {String(firstHour + index).padStart(2, "0")}:00
                </span>
              ))}
            </div>
          </div>
          {columns.map((column) => {
            // Rendez-vous qui se chevauchent : côte à côte.
            const lanes = layoutLanes(column.appointments);
            return (
              <div
                key={column.key}
                className={`border-r border-hairline last:border-r-0 ${options.wide ? "w-44 shrink-0 sm:w-52 lg:min-w-40 lg:flex-1" : "min-w-0 flex-1"}`}
              >
                <div className="flex h-14 items-center justify-center border-b border-hairline px-2">
                  {column.header}
                </div>
                <div className="relative" style={{ height }}>
                  {/* Lignes des heures et demi-heures. */}
                  {Array.from({ length: lastHour - firstHour }, (_, index) => (
                    <div key={index} aria-hidden="true">
                      <div
                        className="absolute inset-x-0 border-t border-hairline"
                        style={{ top: index * HOUR_HEIGHT }}
                      />
                      <div
                        className="absolute inset-x-0 border-t border-dashed border-hairline/70"
                        style={{ top: index * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                      />
                    </div>
                  ))}
                  {/* Hors horaires d'ouverture : grisé. */}
                  {column.closed.map((gap) => (
                    <div
                      key={`${gap.from}-${gap.to}`}
                      aria-hidden="true"
                      className="absolute inset-x-0 bg-[repeating-linear-gradient(45deg,#fafbfd,#fafbfd_6px,#f3f5f9_6px,#f3f5f9_12px)]"
                      style={{ top: top(gap.from), height: top(gap.to) - top(gap.from) }}
                    />
                  ))}
                  {column.timeOff.map((off) => (
                    <div
                      key={off.id}
                      className="absolute inset-x-1 rounded-lg border border-dashed border-[#d5dae4] bg-[#f4f6fa] p-1.5 text-[0.8125rem] text-ink-soft"
                      style={{ top: top(off.from), height: Math.max(top(off.to) - top(off.from), 18) }}
                    >
                      {t(`timeOff.${off.kind}` as "timeOff.leave")}
                    </div>
                  ))}
                  {column.appointments.map((item) => {
                    const place = lanes.get(item.id) ?? { lane: 0, lanes: 1 };
                    const from = top(minutesOf(item.startsAt));
                    const size = Math.max(top(minutesOf(item.endsAt)) - from, 30);
                    const compact = size < 52;
                    return (
                      <Link
                        key={item.id}
                        href={`${page.base}/rendez-vous/${item.id}`}
                        className={`absolute z-10 overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-[0.8125rem] leading-tight shadow-[0_1px_2px_rgba(15,24,48,.06)] transition hover:z-20 hover:shadow-[0_8px_20px_-10px_rgba(15,24,48,.35)] ${
                          item.status === "no_show" ? "opacity-50" : ""
                        }`}
                        style={{
                          top: from + 1,
                          height: size - 2,
                          left: `calc(${(place.lane / place.lanes) * 100}% + 3px)`,
                          width: `calc(${100 / place.lanes}% - 6px)`,
                          borderLeftColor: item.staffColor ?? DEFAULT_COLOR,
                          backgroundColor: tint(item.staffColor),
                        }}
                      >
                        <span className="flex items-center gap-1 text-[0.8125rem] text-ink-soft tabular-nums">
                          {page.fmt.time(item.startsAt)}
                          {place.lanes === 1 && <> – {page.fmt.time(item.endsAt)}</>}
                          {item.source === "online" && place.lanes === 1 && (
                            <DashIcon d={DASH_ICONS.globe} className="ml-auto h-3 w-3 shrink-0" />
                          )}
                        </span>
                        <span className="block truncate font-medium text-night">{item.customerName}</span>
                        {!compact && (
                          <span className="block truncate text-ink-soft">{item.services.join(" + ")}</span>
                        )}
                      </Link>
                    );
                  })}
                  {/* Maintenant. */}
                  {(options.nowColumn === "*" || options.nowColumn === column.key) &&
                    nowMinute >= firstHour * 60 &&
                    nowMinute <= lastHour * 60 && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 z-30 border-t-2 border-[#e8503f]"
                        style={{ top: top(nowMinute) }}
                      >
                        <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-[#e8503f]" />
                      </div>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ─── Semaine : sept colonnes sur ordinateur, liste par jour sur téléphone ──
  if (view === "week") {
    const weekdayShort = fmt({ weekday: "short" });
    const columns: GridColumn[] = visibleDays.map((day) => ({
      key: day,
      header: (
        <Link
          href={link({ date: day, vue: "jour" })}
          className="flex flex-col items-center leading-tight"
          aria-label={page.fmt.day(instant(day))}
        >
          <span className="text-[0.8125rem] uppercase tracking-[0.06em] text-ink-soft">
            {weekdayShort.format(instant(day)).replace(".", "")}
          </span>
          <span
            className={`mt-0.5 flex size-7 items-center justify-center rounded-full text-[0.9375rem] font-medium tabular-nums ${
              day === today ? "bg-accent text-white" : "text-night"
            }`}
          >
            {Number(day.slice(8))}
          </span>
        </Link>
      ),
      appointments: onDay(day),
      timeOff: timeOffOf(day, memberFilter),
      closed: closedOf(day),
    }));
    return (
      <div className="space-y-5">
        {header}
        <div className="hidden lg:block">{grid(columns, { nowColumn: today, wide: false })}</div>
        <div className="space-y-5 lg:hidden">
          {visibleDays.map((day) => {
            const dayAppointments = onDay(day);
            const dayOff = dayOffOf(day);
            const label = page.fmt.day(instant(day));
            return (
              <section key={day} aria-label={label} className="space-y-2">
                <h2 className="flex items-baseline justify-between gap-2">
                  <Link
                    href={link({ date: day, vue: "jour" })}
                    className={`font-display text-[1.05rem] font-semibold first-letter:uppercase ${day === today ? "text-accent" : "text-night"}`}
                  >
                    {label}
                  </Link>
                  <span className="text-sm text-ink-soft">
                    {t("dayCount", { count: dayAppointments.length })}
                  </span>
                </h2>
                {dayOff.map((off) => (
                  <p key={off.id} className="rounded-xl bg-[#f1f2f5] px-4 py-2 text-sm text-ink-soft">
                    {t(`timeOff.${off.kind}`)} · {off.staffName ?? ""} {off.reason ? `· ${off.reason}` : ""}
                  </p>
                ))}
                {dayAppointments.length === 0 && dayOff.length === 0 ? (
                  <p className="text-sm text-ink-soft">{t("empty")}</p>
                ) : (
                  <DayTimeline
                    items={dayAppointments}
                    tenantId={page.tenantId}
                    base={page.base}
                    time={page.fmt.time}
                    now={now}
                  />
                )}
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Jour : frise horaire, une colonne par membre ──────────────────────────
  const columns: GridColumn[] = members.map((member) => {
    const memberAppointments = appointments.filter((item) => item.staffId === member.id);
    return {
      key: member.id,
      header: (
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-semibold text-white"
            style={{ backgroundColor: member.color ?? DEFAULT_COLOR }}
          >
            {initials(member.name)}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[0.9375rem] font-medium text-night">
              {member.name}
              {member.inactive && <span className="font-normal text-ink-soft"> ({t("inactiveStaff")})</span>}
            </span>
            <span className="block text-[0.8125rem] text-ink-soft">
              {t("dayCount", { count: memberAppointments.length })}
            </span>
          </span>
          {!member.inactive && (
            <Link
              href={`${page.base}/rendez-vous/nouveau?date=${date}&membre=${member.id}`}
              aria-label={`${t("add")} · ${member.name}`}
              className="ml-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-accent-soft hover:text-accent"
            >
              <DashIcon d={DASH_ICONS.plus} className="h-4 w-4" />
            </Link>
          )}
        </span>
      ),
      appointments: memberAppointments,
      timeOff: timeOffOf(date, member.id),
      closed: closedOf(date),
    };
  });

  return (
    <div className="space-y-5">
      {header}
      {hoursOf(date).length === 0 && appointments.length === 0 && (
        <p className="rounded-2xl border border-hairline bg-white px-5 py-4 text-ink-soft">{t("closed")}</p>
      )}
      {/* Téléphone : liste lisible (comme la semaine) ; frise horaire à partir de la tablette. */}
      <div className="hidden sm:block">
        {grid(columns, { nowColumn: date === today ? "*" : null, wide: columns.length > 2 })}
      </div>
      <div className="space-y-2 sm:hidden">
        {dayOffOf(date).map((off) => (
          <p key={off.id} className="rounded-xl bg-[#f1f2f5] px-4 py-2 text-sm text-ink-soft">
            {t(`timeOff.${off.kind}`)} · {off.staffName ?? ""} {off.reason ? `· ${off.reason}` : ""}
          </p>
        ))}
        {onDay(date).length === 0 ? (
          <p className="rounded-2xl border border-hairline bg-white px-5 py-4 text-ink-soft">{t("empty")}</p>
        ) : (
          <DayTimeline
            items={onDay(date)}
            tenantId={page.tenantId}
            base={page.base}
            time={page.fmt.time}
            now={now}
          />
        )}
      </div>
    </div>
  );
}
