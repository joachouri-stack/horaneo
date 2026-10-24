"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import type { DayAvailability, PublicResult } from "@/app/(tenant)/sites/[tenantId]/reserver/actions";
import { dayChip } from "./format";

export type PickedSlot = { start: string; time: string; date: string; staffId: string | null };

type Props = {
  locale: string;
  staffOptions: { id: string; name: string }[];
  loadDays: (staffId: string | null, fromDate?: string) => Promise<PublicResult<DayAvailability[]>>;
  onPick: (slot: PickedSlot) => void;
  onError: (error: string) => void;
  selected?: PickedSlot | null;
  /** Praticienne choisie d'avance (« Reprendre ce soin »). */
  initialStaffId?: string | null;
  /** Réservation possible jusqu'à N jours : au-delà de 45, raccourci « Aller au mois de… ». */
  maxAdvanceDays?: number;
};

/** Mois réservables (« 2026-11 »), du mois en cours à celui de la date limite. */
function bookableMonths(maxAdvanceDays: number) {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth(), now.getDate() + maxAdvanceDays);
  const months: string[] = [];
  for (
    let y = now.getFullYear(), m = now.getMonth();
    y < last.getFullYear() || (y === last.getFullYear() && m <= last.getMonth());
    m++
  ) {
    if (m === 12) {
      m = 0;
      y++;
    }
    months.push(`${y}-${String(m + 1).padStart(2, "0")}`);
  }
  return months;
}

/** Choix du membre (ou « sans préférence »), du jour puis de l'heure. */
export function SlotPicker({
  locale,
  staffOptions,
  loadDays,
  onPick,
  onError,
  selected,
  initialStaffId,
  maxAdvanceDays,
}: Props) {
  const t = useTranslations("booking.slot");
  const [staffId, setStaffId] = useState<string | null>(
    selected?.staffId ??
      (initialStaffId && staffOptions.some((option) => option.id === initialStaffId) ? initialStaffId : null),
  );
  const [days, setDays] = useState<DayAvailability[]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (member: string | null, fromDate?: string) => {
      setLoading(true);
      const result = await loadDays(member, fromDate);
      setLoading(false);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      setDays(result.data);
      setDate(result.data.find((day) => day.slots.length > 0)?.date ?? null);
    },
    [loadDays, onError],
  );

  useEffect(() => {
    // Premier chargement des créneaux (14 jours à partir d'aujourd'hui).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(staffId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseStaff = (member: string | null) => {
    setStaffId(member);
    setPages([]);
    void load(member);
  };

  const nextPage = () => {
    const last = days.at(-1)?.date;
    if (!last) return;
    const [y, m, d] = last.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    setPages([...pages, days[0].date]);
    void load(staffId, next);
  };

  const months = maxAdvanceDays && maxAdvanceDays > 45 ? bookableMonths(maxAdvanceDays) : [];
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const goToMonth = (month: string) => {
    // Mois en cours : depuis aujourd'hui ; sinon depuis le 1er du mois.
    const first = months[0] === month ? undefined : `${month}-01`;
    setPages(first ? [days[0]?.date].filter((value): value is string => Boolean(value)) : []);
    void load(staffId, first);
  };

  const previousPage = () => {
    const previous = pages.at(-1);
    setPages(pages.slice(0, -1));
    void load(staffId, previous);
  };

  const current = days.find((day) => day.date === date);
  const hasAny = days.some((day) => day.slots.length > 0);

  return (
    <div className="space-y-6">
      {staffOptions.length > 1 && (
        <fieldset className="min-w-0">
          <legend className="mb-3 text-lg font-semibold text-site-text">{t("staff")}</legend>
          <div className="flex flex-wrap gap-2">
            {[{ id: null, name: t("noPreference") }, ...staffOptions].map((option) => (
              <label
                key={option.id ?? "any"}
                className="relative cursor-pointer rounded-site border border-site-border px-4 py-3 text-site-text has-[:checked]:border-site-button has-[:checked]:bg-site-button has-[:checked]:text-site-on-button has-[:focus-visible]:outline has-[:focus-visible]:outline-2"
              >
                <input
                  type="radio"
                  name="staff"
                  className="sr-only"
                  checked={staffId === option.id}
                  onChange={() => chooseStaff(option.id)}
                />
                {option.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="min-w-0">
        <legend className="mb-3 text-lg font-semibold text-site-text">{t("day")}</legend>
        {months.length > 1 && (
          <div className="mb-3">
            <label htmlFor="slot-month" className="mb-1 block text-sm text-site-muted">
              {t("goToMonth")}
            </label>
            <select
              id="slot-month"
              value={days[0]?.date.slice(0, 7) ?? months[0]}
              onChange={(event) => goToMonth(event.target.value)}
              className="block min-h-12 w-full rounded-site border border-site-border bg-site-bg px-4 text-site-text first-letter:uppercase sm:w-auto"
            >
              {months.map((month) => (
                <option key={month} value={month}>
                  {monthLabel.format(new Date(`${month}-01T12:00:00Z`))}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2" aria-busy={loading}>
          {days.map((day) => {
            const chip = dayChip(day.date, locale);
            const disabled = day.slots.length === 0;
            return (
              <label
                key={day.date}
                aria-disabled={disabled}
                className={`relative flex min-w-16 shrink-0 cursor-pointer flex-col items-center rounded-site border px-3 py-2 ${disabled ? "cursor-not-allowed border-site-border text-site-muted opacity-50" : "border-site-border text-site-text"} has-[:checked]:border-site-button has-[:checked]:bg-site-button has-[:checked]:text-site-on-button has-[:focus-visible]:outline has-[:focus-visible]:outline-2`}
              >
                <input
                  type="radio"
                  name="day"
                  className="sr-only"
                  disabled={disabled}
                  checked={date === day.date}
                  onChange={() => setDate(day.date)}
                  aria-label={chip.full}
                />
                <span className="text-xs uppercase">{chip.weekday}</span>
                <span className="text-xl font-semibold">{chip.day}</span>
                <span className="text-xs">{chip.month}</span>
              </label>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-sm">
          {pages.length > 0 ? (
            <button type="button" onClick={previousPage} className="font-semibold text-site-accent underline">
              ← {t("previousDays")}
            </button>
          ) : (
            <span />
          )}
          {days.length > 0 && (
            <button type="button" onClick={nextPage} className="font-semibold text-site-accent underline">
              {t("moreDays")} →
            </button>
          )}
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="mb-3 text-lg font-semibold text-site-text">{t("time")}</legend>
        {loading ? (
          <p role="status" className="text-site-muted">
            {t("loading")}
          </p>
        ) : !hasAny ? (
          <p className="text-site-muted">{t("noSlots")}</p>
        ) : !current || current.slots.length === 0 ? (
          <p className="text-site-muted">{t("noSlotsDay")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {current.slots.map((slot) => (
              <button
                key={slot.start}
                type="button"
                onClick={() => onPick({ start: slot.start, time: slot.time, date: current.date, staffId })}
                aria-pressed={selected?.start === slot.start}
                className="min-h-12 rounded-site border border-site-border text-lg font-semibold text-site-text hover:border-site-button aria-pressed:bg-site-button aria-pressed:text-site-on-button"
              >
                {slot.time}
              </button>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}
