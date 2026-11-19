import { Fragment, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { RememberAgendaMembers } from "@/components/manager/RememberAgendaMembers";
import { BreakSetting } from "@/components/manager/BreakSetting";
import { BREAK_MINUTES } from "@/modules/booking/settings";
import { agendaMembersCookie } from "@/lib/manager/agenda-members";
import { and, eq, inArray } from "drizzle-orm";
import { DASH_ICONS, DashIcon } from "@/components/manager/DashboardWidgets";
import { DayTimeline, initials } from "@/components/manager/DayTimeline";
import { assets, openingHours, staffMembers, staffSchedules } from "@/db/schema";
import { storage } from "@/lib/storage";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { agendaStaffFilter, canAccess } from "@/modules/team/access";
import { layoutLanes } from "@/modules/agenda/lanes";
import {
  dayRange,
  listAgenda,
  listTimeOff,
  searchAppointments,
  type AgendaAppointment,
} from "@/modules/agenda/queries";
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
const NOON = 12 * 60; // vue semaine sur téléphone : matin avant midi, après-midi ensuite
/** Valeur du lien et du choix gardé : toute l'équipe. */
const ALL_MEMBERS = "tous";

/** Nombre de jours entre deux dates AAAA-MM-JJ. */
function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Fond teinté d'un rendez-vous : la couleur du membre, très éclaircie. */
const tint = (color: string | null, percent = 22) =>
  `color-mix(in srgb, ${color ?? DEFAULT_COLOR} ${percent}%, white)`;

type GridColumn = {
  key: string;
  header: ReactNode;
  appointments: AgendaAppointment[];
  timeOff: { id: string; kind: string; from: number; to: number }[];
  /** Plages fermées (minutes depuis minuit), grisées. */
  closed: { from: number; to: number }[];
  /** Créneaux vides cliquables : nouveau rendez-vous ce jour-là (et pour ce membre). */
  slot?: { date: string; staffId: string | null };
};

/** Coche (client venu). */
const CHECK_ICON = "M5 12l5 5L20 7";

/** Pas des créneaux cliquables de la frise (minutes). */
const SLOT_MINUTES = 30;

/**
 * Agenda : vue jour (une colonne par membre), semaine (sept colonnes sur
 * ordinateur, liste par jour sur téléphone) ou mois, filtrable par membre.
 */
export default async function AgendaPage({
  params,
  searchParams,
}: PageProps<"/[locale]/espace/[tenantId]/agenda">) {
  const page = await managerPage(params, "agenda");
  const query = await searchParams;
  const t = await getTranslations("manager.agenda");
  const tUnavailability = await getTranslations("manager.unavailability");
  const tz = page.tenant.timezone;
  const now = new Date();
  const today = utcToLocal(now, tz).date;
  const date = typeof query.date === "string" && DATE_PATTERN.test(query.date) ? query.date : today;
  const view = query.vue === "semaine" ? "week" : query.vue === "mois" ? "month" : "day";
  const searchText = typeof query.q === "string" ? query.q.trim().slice(0, 80) : "";
  // Collaborateur limité à son agenda : toujours son membre, quel que soit le lien.
  const ownStaff = agendaStaffFilter(page.space);
  // Membres affichés, choisis par la gérante (boutons à allumer ou éteindre) : lien
  // « ?membres=a,b », sinon le dernier choix gardé sur l'appareil, sinon toute l'équipe.
  // « ?membre=a » (un seul membre) reste accepté pour les anciens liens.
  const UUID = /^[0-9a-f-]{36}$/i;
  const savedMembers = (await cookies()).get(agendaMembersCookie(page.tenantId))?.value;
  const rawMembers =
    typeof query.membres === "string"
      ? query.membres
      : typeof query.membre === "string"
        ? query.membre
        : (savedMembers ?? "");
  const requested = [...new Set(rawMembers.split(",").filter((id) => UUID.test(id)))];
  // Collaborateur limité : la base ne renvoie que ses rendez-vous. Sinon tout, trié ensuite.
  const memberFilter = ownStaff;
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

  const {
    appointments: loadedAppointments,
    timeOffList: loadedTimeOff,
    staff,
    breakMinutes,
    hours,
    schedules,
    colors,
    photos,
    found,
  } = await page.db(async (tx) => ({
    appointments: await listAgenda(tx, page.tenantId, {
      from: range.start,
      to: range.end,
      staffId: memberFilter,
      locale: page.locale,
    }),
    timeOffList: await listTimeOff(tx, page.tenantId, range.start, range.end, memberFilter),
    ...(await (async () => {
      const context = await loadBookingContext(tx, page.tenantId);
      return { staff: context.staff, breakMinutes: context.settings.breakMinutes };
    })()),
    hours: await tx.select().from(openingHours).where(eq(openingHours.tenantId, page.tenantId)),
    // Horaires de travail de chaque membre (en-têtes et plages grisées de la vue Jour).
    schedules: await tx.select().from(staffSchedules).where(eq(staffSchedules.tenantId, page.tenantId)),
    // Couleur de chaque membre (en-têtes de colonnes et filtres).
    colors: new Map(
      (
        await tx
          .select({ id: staffMembers.id, color: staffMembers.color })
          .from(staffMembers)
          .where(eq(staffMembers.tenantId, page.tenantId))
      ).map((row) => [row.id, row.color]),
    ),
    // Photo de chaque membre (en-têtes de colonnes) : clé de stockage, s'il en a une.
    photos: await (async () => {
      const rows = await tx
        .select({ id: staffMembers.id, photoAssetId: staffMembers.photoAssetId })
        .from(staffMembers)
        .where(eq(staffMembers.tenantId, page.tenantId));
      const ids = rows.map((row) => row.photoAssetId).filter((id) => id !== null);
      const keys = ids.length
        ? await tx
            .select({ id: assets.id, storageKey: assets.storageKey })
            .from(assets)
            .where(
              and(eq(assets.tenantId, page.tenantId), eq(assets.status, "active"), inArray(assets.id, ids)),
            )
        : [];
      return new Map(
        rows.map((row) => [row.id, keys.find((key) => key.id === row.photoAssetId)?.storageKey ?? null]),
      );
    })(),
    // Barre « Trouver un rendez-vous » : résultats de la recherche.
    found: searchText
      ? await searchAppointments(tx, page.tenantId, {
          query: searchText,
          locale: page.locale,
          staffId: memberFilter,
          now,
        })
      : null,
  }));
  const store = storage();
  const photoOf = (id: string) => {
    const key = photos.get(id);
    return key ? store.publicUrl(key) : null;
  };
  /** Photo du membre (cerclée de sa couleur), ou ses initiales sur sa couleur. */
  const avatar = (member: { id: string; name: string; color: string | null }, size: string, dim = false) => {
    const url = photoOf(member.id);
    const color = member.color ?? DEFAULT_COLOR;
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className={`${size} shrink-0 rounded-full object-cover ring-2 ${dim ? "opacity-40" : ""}`}
        style={{ ["--tw-ring-color" as string]: color }}
      />
    ) : (
      <span
        aria-hidden="true"
        className={`flex ${size} shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-semibold text-white ${dim ? "opacity-40" : ""}`}
        style={{ backgroundColor: color }}
      >
        {initials(member.name)}
      </span>
    );
  };
  // Membres choisis (parmi l'équipe active) ; aucun ou tous : toute l'équipe.
  const chosen = ownStaff ? [] : requested.filter((id) => staff.some((member) => member.id === id));
  const selected = chosen.length > 0 && chosen.length < staff.length ? new Set(chosen) : null;
  const appointments = selected
    ? loadedAppointments.filter((item) => selected.has(item.staffId))
    : loadedAppointments;
  // Fermetures de l'établissement (sans membre) : toujours affichées.
  const timeOffList = selected
    ? loadedTimeOff.filter((off) => off.staffId === null || selected.has(off.staffId))
    : loadedTimeOff;
  const membersParam = selected ? [...selected].join(",") : ALL_MEMBERS;
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
  const members = memberFilter
    ? allColumns.filter((member) => member.id === memberFilter)
    : selected
      ? allColumns.filter((member) => selected.has(member.id))
      : allColumns;

  const link = (changes: Record<string, string | null>) => {
    const next = { date, vue: VIEW_PARAM[view], membres: ownStaff ? null : membersParam, ...changes };
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
        {/* Trouver un rendez-vous : par nom, téléphone ou e-mail du client. */}
        <form
          method="get"
          role="search"
          className="order-last flex w-full gap-2 md:order-none md:ml-auto md:w-80"
        >
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="vue" value={VIEW_PARAM[view]} />
          {!ownStaff && <input type="hidden" name="membres" value={membersParam} />}
          <label htmlFor="agenda-search" className="sr-only">
            {t("searchLabel")}
          </label>
          <input
            id="agenda-search"
            name="q"
            type="search"
            defaultValue={searchText}
            placeholder={t("searchPlaceholder")}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-hairline bg-white px-3.5 text-[0.9375rem] text-night placeholder:text-ink/60 focus:border-accent focus:outline-none"
          />
          <button type="submit" aria-label={t("searchLabel")} className={iconButton}>
            <DashIcon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4" className="h-5 w-5" />
          </button>
        </form>
        <Link
          href={`${page.base}/rendez-vous/nouveau?date=${date}`}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-[0.95rem] font-medium text-white shadow-[0_1px_2px_rgba(15,24,48,.08)] transition hover:bg-accent-strong sm:px-5"
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
      {/* Pause entre deux rendez-vous : réglage rapide, à portée de main (gérante). */}
      {canAccess(page.space, "owner") && (
        <BreakSetting tenantId={page.tenantId} value={breakMinutes} options={BREAK_MINUTES} />
      )}
      {found && (
        <section
          aria-labelledby="agenda-results"
          className="rounded-2xl border border-hairline bg-white p-4 shadow-[0_1px_2px_rgba(15,24,48,.04)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="agenda-results" className="font-medium text-night">
              {t("searchResults", { count: found.length, query: searchText })}
            </h2>
            <Link href={link({})} className="text-sm font-medium text-accent underline">
              {t("searchClear")}
            </Link>
          </div>
          {found.length > 0 && (
            <ul className="mt-2 divide-y divide-hairline">
              {found.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`${page.base}/rendez-vous/${item.id}`}
                    className="flex items-center gap-3 rounded-xl px-1 py-2.5 transition hover:bg-mist-50"
                  >
                    <span
                      aria-hidden="true"
                      className="h-9 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: item.staffColor ?? DEFAULT_COLOR }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-night">{item.customerName}</span>
                      <span className="block truncate text-sm text-ink-soft">
                        {item.services.join(" + ")} · {item.staffName}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-sm">
                      <span className="block text-night first-letter:uppercase">
                        {page.fmt.day(item.startsAt)}
                      </span>
                      <span className="block text-ink-soft tabular-nums">
                        {page.fmt.time(item.startsAt)} ·{" "}
                        {item.startsAt >= now ? t("searchUpcoming") : t("searchPast")}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {staff.length > 1 && !ownStaff && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {/* Dernier choix gardé sur cet appareil. */}
          <RememberAgendaMembers tenantId={page.tenantId} value={membersParam} />
          <Link
            href={link({ membres: ALL_MEMBERS })}
            aria-current={!selected ? "true" : undefined}
            className="flex min-h-10 shrink-0 items-center rounded-full border border-hairline bg-white px-4 text-[0.9375rem] font-medium text-night aria-[current=true]:border-night aria-[current=true]:bg-night aria-[current=true]:text-white"
          >
            {t("allStaff")}
          </Link>
          {/* Chaque membre s'allume ou s'éteint ; au moins un reste affiché. */}
          {staff.map((member) => {
            const shown = !selected || selected.has(member.id);
            const current = selected ? [...selected] : staff.map((item) => item.id);
            const next = shown ? current.filter((id) => id !== member.id) : [...current, member.id];
            const href =
              next.length === 0
                ? null
                : link({ membres: next.length === staff.length ? ALL_MEMBERS : next.join(",") });
            const chip = (
              <>
                {avatar(
                  { id: member.id, name: member.name, color: colors.get(member.id) ?? null },
                  "size-7",
                  !shown,
                )}
                {member.name}
                {/* État annoncé aux lecteurs d'écran (affiché ou masqué). */}
                <span className="sr-only"> · {shown ? t("memberShown") : t("memberHidden")}</span>
              </>
            );
            const chipClass = `flex min-h-10 shrink-0 items-center gap-2 rounded-full border py-1 pl-1.5 pr-4 text-[0.9375rem] font-medium ${
              shown
                ? "border-night bg-white text-night"
                : "border-hairline bg-white/60 text-ink/70 line-through"
            }`;
            return href ? (
              <Link key={member.id} href={href} className={chipClass}>
                {chip}
              </Link>
            ) : (
              <span key={member.id} aria-disabled="true" className={chipClass}>
                {chip}
              </span>
            );
          })}
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
                      closed ? "bg-[#f1f3f7]" : ""
                    } ${outside ? "opacity-60" : ""}`}
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

  /** Plages de la frise en dehors de ces plages ouvertes, en minutes. */
  const gapsOutside = (ranges: { from: number; to: number }[]) => {
    const open = [...ranges].sort((a, b) => a.from - b.from);
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
  /** Plages hors horaires d'ouverture d'un jour (grisées), en minutes. */
  const closedOf = (day: string) =>
    gapsOutside(
      hoursOf(day).map((range) => ({
        from: timeToMinutes(range.opensAt),
        to: timeToMinutes(range.closesAt),
      })),
    );
  /**
   * Horaires de travail d'un membre ce jour-là (minutes), ou null s'il n'a aucun horaire
   * enregistré (rien n'est alors grisé ni affiché pour lui).
   */
  const workOf = (memberId: string, day: string) => {
    const own = schedules.filter((row) => row.staffId === memberId);
    if (own.length === 0) return null;
    return own
      .filter(
        (row) =>
          row.weekday === isoWeekday(day) &&
          (!row.validFrom || row.validFrom <= day) &&
          (!row.validUntil || day <= row.validUntil),
      )
      .map((row) => ({ from: timeToMinutes(row.startsAt), to: timeToMinutes(row.endsAt) }))
      .sort((a, b) => a.from - b.from);
  };
  /** Heure courte des en-têtes (colonnes étroites sur téléphone) : « 10h », « 10h30 ». */
  const clock = (minutes: number) =>
    `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`;
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

  /** Petites icônes d'état : acompte payé, client venu, paiement en attente, réservé en ligne. */
  const stateIcons = (item: AgendaAppointment) =>
    [
      item.status === "attended" && { key: "attended", d: CHECK_ICON, className: "text-success" },
      item.status === "pending_payment" && {
        key: "pending",
        d: DASH_ICONS.clock,
        className: "text-[#a15c00]",
      },
      item.depositCents > 0 &&
        (item.status === "confirmed" || item.status === "attended") && {
          key: "deposit",
          d: DASH_ICONS.euro,
          className: "text-success",
        },
      item.source === "online" && { key: "online", d: DASH_ICONS.globe, className: "text-ink-soft" },
    ].filter(
      (icon): icon is { key: "attended" | "pending" | "deposit" | "online"; d: string; className: string } =>
        Boolean(icon),
    );

  const grid = (columns: GridColumn[], options: { nowColumn: string | null; wide: boolean }) => (
    <div className="overflow-hidden rounded-[1.4rem] border border-hairline bg-white">
      <div className="overflow-x-auto">
        <div className={`flex ${options.wide ? "min-w-fit" : "w-full"}`}>
          {/* Heures. */}
          <div
            className="sticky left-0 z-20 w-12 shrink-0 border-r border-hairline bg-white sm:w-14"
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
                  {/*
                    Créneau vide : un clic ouvre un nouveau rendez-vous déjà rempli (jour, heure,
                    membre). Hors du parcours au clavier : le bouton « + » de la colonne suffit.
                  */}
                  {column.slot &&
                    Array.from({ length: ((lastHour - firstHour) * 60) / SLOT_MINUTES }, (_, index) => {
                      const from = firstHour * 60 + index * SLOT_MINUTES;
                      const to = from + SLOT_MINUTES;
                      const blocked = [...column.closed, ...column.timeOff].some(
                        (gap) => gap.from < to && gap.to > from,
                      );
                      if (blocked) return null;
                      const time = `${String(Math.floor(from / 60)).padStart(2, "0")}:${String(from % 60).padStart(2, "0")}`;
                      const search = new URLSearchParams({ date: column.slot!.date, heure: time });
                      if (column.slot!.staffId) search.set("membre", column.slot!.staffId);
                      return (
                        <Link
                          key={time}
                          href={`${page.base}/rendez-vous/nouveau?${search.toString()}`}
                          tabIndex={-1}
                          aria-label={t("addAt", { time })}
                          className="group absolute inset-x-0 flex items-start px-2 pt-0.5 text-[0.75rem] font-medium text-accent hover:bg-accent-soft/60"
                          style={{ top: top(from), height: top(to) - top(from) }}
                        >
                          <span aria-hidden="true" className="opacity-0 group-hover:opacity-100">
                            + {time}
                          </span>
                        </Link>
                      );
                    })}
                  {/* Hors horaires d'ouverture : grisé. */}
                  {column.closed.map((gap, index) => {
                    // Coupure au milieu de la journée (déjeuner…) : affichée comme une pause.
                    const isBreak =
                      gap.from > firstHour * 60 &&
                      gap.to < lastHour * 60 &&
                      top(gap.to) - top(gap.from) >= 22;
                    return (
                      <div
                        key={`${index}-${gap.from}-${gap.to}`}
                        className="absolute inset-x-0 bg-[repeating-linear-gradient(45deg,#fafbfd,#fafbfd_6px,#f3f5f9_6px,#f3f5f9_12px)]"
                        style={{ top: top(gap.from), height: top(gap.to) - top(gap.from) }}
                      >
                        {isBreak && (
                          <span className="m-1 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-0.5 text-[0.8125rem] font-medium text-ink-soft shadow-[0_1px_2px_rgba(15,24,48,.06)]">
                            {t("break")} · {clock(gap.from)}–{clock(gap.to)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {column.timeOff.map((off) => (
                    <Link
                      key={off.id}
                      href={`${page.base}/indisponibilites/${off.id}`}
                      className="absolute inset-x-1 rounded-lg border border-dashed border-[#d5dae4] bg-[#f4f6fa] p-1.5 text-[0.8125rem] text-ink-soft transition hover:border-accent-line"
                      style={{ top: top(off.from), height: Math.max(top(off.to) - top(off.from), 18) }}
                    >
                      {t(`timeOff.${off.kind}` as "timeOff.leave")}
                    </Link>
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
                        className={`absolute z-10 overflow-hidden rounded-lg border-l-4 px-2 py-1 text-[0.8125rem] leading-tight shadow-[0_1px_2px_rgba(15,24,48,.06)] transition hover:z-20 hover:shadow-[0_8px_20px_-10px_rgba(15,24,48,.35)] ${
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
                        <span className="flex items-center gap-1 text-[0.8125rem] text-ink tabular-nums">
                          {page.fmt.time(item.startsAt)}
                          {place.lanes === 1 && <> – {page.fmt.time(item.endsAt)}</>}
                          {/* État du rendez-vous en un coup d'œil (lu aussi par les lecteurs d'écran). */}
                          <span className="ml-auto flex shrink-0 items-center gap-0.5">
                            {stateIcons(item).map((icon) => (
                              <span key={icon.key} title={t(`icons.${icon.key}`)} className={icon.className}>
                                <DashIcon d={icon.d} className="h-3.5 w-3.5" />
                                <span className="sr-only">{t(`icons.${icon.key}`)}</span>
                              </span>
                            ))}
                          </span>
                        </span>
                        <span className="block truncate font-medium text-night">{item.customerName}</span>
                        {!compact && (
                          <span className="block truncate text-ink">{item.services.join(" + ")}</span>
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
                        className="pointer-events-none absolute inset-x-0 z-30 border-t-2 border-[#6d3ae0]"
                        style={{ top: top(nowMinute) }}
                      >
                        <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-[#6d3ae0]" />
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
      // Un seul membre affiché : le nouveau rendez-vous est pour lui.
      slot: { date: day, staffId: ownStaff ?? (selected?.size === 1 ? [...selected][0] : null) },
    }));
    return (
      <div className="space-y-5">
        {header}
        <div className="hidden lg:block">{grid(columns, { nowColumn: today, wide: false })}</div>
        {/*
          Téléphone et tablette : sept colonnes (comme un calendrier de téléphone), les
          rendez-vous de chaque jour empilés l'un sous l'autre par heure, à la couleur du membre.
        */}
        <div className="overflow-hidden rounded-[1.4rem] border border-hairline bg-white lg:hidden">
          <div className="grid grid-cols-7">
            {visibleDays.map((day, index) => {
              const closed = onDay(day).length === 0 && hoursOf(day).length === 0;
              const label = `${page.fmt.day(instant(day))} · ${
                closed ? t("closed") : t("dayCount", { count: onDay(day).length })
              }`;
              // En-tête du jour : bandeau séparé des rendez-vous par un trait.
              return (
                <Link
                  key={day}
                  href={link({ date: day, vue: "jour" })}
                  aria-label={label}
                  className={`flex flex-col items-center border-b border-hairline py-2 leading-tight ${index < 6 ? "border-r" : ""} ${
                    day === today ? "bg-accent-soft" : "bg-mist-50"
                  }`}
                >
                  <span
                    className={`text-[0.6875rem] font-medium uppercase tracking-[0.04em] ${
                      day === today ? "text-accent" : "text-ink-soft"
                    }`}
                  >
                    {weekdayShort.format(instant(day)).replace(".", "")}
                  </span>
                  <span
                    className={`mt-0.5 flex size-7 items-center justify-center rounded-full text-[0.9375rem] font-semibold tabular-nums ${
                      day === today ? "bg-accent text-white" : "text-night"
                    }`}
                  >
                    {Number(day.slice(8))}
                  </span>
                </Link>
              );
            })}
            {/* Matin puis après-midi : deux rangées alignées sur toute la semaine. */}
            {(["morning", "afternoon"] as const).map((period) => (
              <Fragment key={period}>
                <p
                  className={`col-span-7 border-b border-hairline bg-white px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-ink-soft ${
                    period === "afternoon" ? "border-t" : ""
                  }`}
                >
                  {t(`periods.${period}`)}
                </p>
                {visibleDays.map((day, index) => {
                  const inPeriod = (date: Date, sameDay: boolean) =>
                    period === "morning"
                      ? !sameDay || minutesOf(date) < NOON
                      : sameDay && minutesOf(date) >= NOON;
                  const dayAppointments = onDay(day).filter((item) => inPeriod(item.startsAt, true));
                  // Absence commencée un autre jour : affichée le matin.
                  const dayOff = dayOffOf(day).filter((off) =>
                    inPeriod(off.startsAt, utcToLocal(off.startsAt, tz).date === day),
                  );
                  const closed = onDay(day).length === 0 && hoursOf(day).length === 0;
                  return (
                    <div
                      key={day}
                      className={`flex min-h-36 min-w-0 flex-col gap-1 border-hairline px-0.5 py-1.5 sm:px-1 ${index < 6 ? "border-r" : ""} ${
                        closed ? "bg-[#f1f3f7]" : day === today ? "bg-accent-soft/40" : ""
                      }`}
                    >
                      {closed && period === "morning" && (
                        <span className="mt-1 text-center text-[10px] font-medium text-ink-soft">
                          {t("closed")}
                        </span>
                      )}
                      {dayOff.map((off) => (
                        <Link
                          key={off.id}
                          href={`${page.base}/indisponibilites/${off.id}`}
                          aria-label={`${t(`timeOff.${off.kind}`)} · ${off.staffName ?? ""} · ${tUnavailability("edit")}`}
                          className="block rounded-md bg-[#e9ebf0] px-1 py-1 text-[10px] leading-tight text-ink-soft [overflow-wrap:anywhere] hover:bg-[#e1e4ea]"
                        >
                          <span className="line-clamp-2">
                            {t(`timeOff.${off.kind}`)}
                            {off.staffName ? ` · ${off.staffName}` : ""}
                          </span>
                        </Link>
                      ))}
                      {dayAppointments.map((item) => (
                        <Link
                          key={item.id}
                          href={`${page.base}/rendez-vous/${item.id}`}
                          aria-label={`${page.fmt.time(item.startsAt)} · ${item.customerName}`}
                          className={`block rounded-md border-l-[3px] px-1 py-1 leading-tight text-night transition hover:brightness-95 ${
                            item.status === "no_show" ? "opacity-50" : ""
                          }`}
                          style={{
                            borderLeftColor: item.staffColor ?? DEFAULT_COLOR,
                            backgroundColor: tint(item.staffColor),
                          }}
                        >
                          {/* Prénom puis nom, chacun sur sa ligne (coupés proprement si trop longs). */}
                          {item.customerName
                            .split(/\s+/)
                            .reduce<string[]>(
                              (lines, word, index) =>
                                index === 0 ? [word] : [lines[0], lines[1] ? `${lines[1]} ${word}` : word],
                              [],
                            )
                            .map((line, index) => (
                              <span key={index} className="block truncate text-[11px] font-semibold">
                                {line}
                              </span>
                            ))}
                          <span className="block text-[10px] tabular-nums text-ink-soft">
                            {page.fmt.time(item.startsAt)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Jour : frise horaire, une colonne par membre ──────────────────────────
  const columns: GridColumn[] = members.map((member) => {
    const memberAppointments = appointments.filter((item) => item.staffId === member.id);
    // Horaires du membre ce jour-là : sous son prénom, et grisés en dehors.
    const work = member.inactive ? null : workOf(member.id, date);
    const workLabel =
      work === null
        ? null
        : work.length === 0
          ? t("notWorking")
          : work.map((range) => `${clock(range.from)}–${clock(range.to)}`).join(", ");
    return {
      key: member.id,
      header: (
        <span className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          {avatar(member, "size-9")}
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[0.9375rem] font-medium text-night">
              {member.name}
              {member.inactive && <span className="font-normal text-ink-soft"> ({t("inactiveStaff")})</span>}
            </span>
            {/* Horaires du jour ; le nombre de rendez-vous à partir de la tablette. */}
            <span className="block truncate text-[0.8125rem] text-ink-soft">
              {workLabel}
              <span className="max-sm:hidden">
                {workLabel && " · "}
                {t("dayCount", { count: memberAppointments.length })}
              </span>
            </span>
          </span>
          {!member.inactive && (
            <Link
              href={`${page.base}/rendez-vous/nouveau?date=${date}&membre=${member.id}`}
              aria-label={`${t("add")} · ${member.name}`}
              className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-accent-soft hover:text-accent sm:ml-1"
            >
              <DashIcon d={DASH_ICONS.plus} className="h-4 w-4" />
            </Link>
          )}
        </span>
      ),
      appointments: memberAppointments,
      timeOff: timeOffOf(date, member.id),
      closed: work === null ? closedOf(date) : [...closedOf(date), ...gapsOutside(work)],
      slot: member.inactive ? undefined : { date, staffId: member.id },
    };
  });

  const addHref = `${page.base}/rendez-vous/nouveau?date=${date}${ownStaff ? `&membre=${ownStaff}` : ""}`;

  return (
    <div className="space-y-5">
      {header}
      {/* Jour sans horaires d'ouverture : explication, et lien vers les horaires si permis. */}
      {hoursOf(date).length === 0 && appointments.length === 0 && (
        <ClosedDayCard
          title={t("closedDay.title", { weekday: fmt({ weekday: "long" }).format(instant(date)) })}
          hint={t("closedDay.hint")}
          action={t("closedDay.editHours")}
          href={canAccess(page.space, "site") ? `${page.base}/site/horaires` : null}
        />
      )}
      {/*
        Plusieurs membres : une colonne par membre, côte à côte, aussi sur téléphone
        (au-delà de deux, la frise défile de côté). Un seul membre sur téléphone : liste lisible.
      */}
      <div className={columns.length > 1 ? "" : "hidden sm:block"}>
        {grid(columns, { nowColumn: date === today ? "*" : null, wide: columns.length > 2 })}
      </div>
      <div className={columns.length > 1 ? "hidden" : "space-y-2 sm:hidden"}>
        {dayOffOf(date).map((off) => (
          <Link
            key={off.id}
            href={`${page.base}/indisponibilites/${off.id}`}
            className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-[#f1f2f5] px-4 py-2 text-sm text-ink-soft transition hover:bg-[#e8ebf1]"
          >
            <span>
              {t(`timeOff.${off.kind}`)} · {off.staffName ?? ""} {off.reason ? `· ${off.reason}` : ""}
            </span>
            <span className="shrink-0 font-medium text-accent underline">{tUnavailability("edit")}</span>
          </Link>
        ))}
        {onDay(date).length === 0 ? (
          // Journée vide : toute la carte ajoute un rendez-vous ce jour.
          <Link
            href={addHref}
            className="flex flex-col items-start gap-3 rounded-2xl border border-hairline bg-white px-5 py-4 transition hover:border-accent hover:bg-accent-soft/40"
          >
            <span className="text-ink-soft">{t("emptyDay.title")}</span>
            <span className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 font-medium text-white">
              <DashIcon d={DASH_ICONS.plus} className="h-5 w-5" />
              {t("emptyDay.action")}
            </span>
          </Link>
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
      {/* Téléphone : ajouter un rendez-vous ce jour, juste sous la journée (déjà proposé si elle est vide). */}
      <Link
        href={addHref}
        className={`${columns.length > 1 || onDay(date).length > 0 ? "flex" : "hidden"} min-h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-accent/50 bg-white text-[0.95rem] font-medium text-accent transition hover:bg-accent-soft sm:hidden`}
      >
        <DashIcon d={DASH_ICONS.plus} className="h-5 w-5" />
        {t("addThisDay")}
      </Link>
    </div>
  );
}

/** Jour sans horaires d'ouverture : ce que cela veut dire, et où le changer. */
function ClosedDayCard({
  title,
  hint,
  action,
  href,
}: {
  title: string;
  hint: string;
  action: string;
  href: string | null;
}) {
  const body = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#eceef4] text-ink-soft">
        <DashIcon d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0" className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-night first-letter:uppercase">{title}</span>
        <span className="mt-0.5 block text-sm text-ink-soft">{hint}</span>
        {href && <span className="mt-2 block text-sm font-medium text-accent underline">{action}</span>}
      </span>
    </>
  );
  const className = "flex items-start gap-3 rounded-2xl border border-hairline bg-[#f6f7fa] px-4 py-4";
  return href ? (
    <Link href={href} className={`${className} transition hover:border-accent`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
