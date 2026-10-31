"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  createManualAction,
  freeSlotsAction,
  searchCustomersAction,
} from "@/app/(platform)/[locale]/espace/[tenantId]/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { ui } from "@/components/ui/styles";
import { birthMonthNames } from "@/modules/customers/birthday";

type Props = {
  tenantId: string;
  /** `category` : nom de la catégorie (les prestations sont regroupées par catégorie). */
  services: { id: string; name: string; durationMinutes: number; category: string | null }[];
  staff: { id: string; name: string; serviceIds: string[] }[];
  defaults: {
    date: string;
    time: string;
    /** Heure choisie dans l'agenda : on la garde même si elle n'est pas dans les créneaux libres. */
    timeChosen?: boolean;
    staffId: string | null;
    customer: { id: string; name: string } | null;
  };
};

type Found = { id: string; firstName: string; lastName: string | null; phone: string | null };

/** Créneaux libres rangés par moment de la journée (heure de début). */
const PERIODS = [
  { key: "morning", test: (hour: number) => hour < 12 },
  { key: "afternoon", test: (hour: number) => hour >= 12 && hour < 17 },
  { key: "evening", test: (hour: number) => hour >= 17 },
] as const;

/** Recherche sans tenir compte des accents ni des majuscules. */
const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * Ajout d'un rendez-vous à la main (appel, passage), en trois étapes sur téléphone :
 * la cliente (recherche d'abord), les prestations (par catégorie), puis un créneau libre à toucher.
 */
export function ManualAppointmentForm({ tenantId, services, staff, defaults }: Props) {
  const t = useTranslations("manager.manual");
  const tCustomers = useTranslations("manager.customers");
  const locale = useLocale();
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const eligible = staff.filter((member) => serviceIds.every((id) => member.serviceIds.includes(id)));
  const [staffId, setStaffId] = useState<string>(defaults.staffId ?? staff[0]?.id ?? "");
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [timeChosen, setTimeChosen] = useState(Boolean(defaults.timeChosen));
  const [free, setFree] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(defaults.customer);
  const [serviceQuery, setServiceQuery] = useState("");
  // Liste des prestations repliée une fois un choix fait : l'étape « Quand ? » remonte.
  const [listOpen, setListOpen] = useState(true);
  const effectiveStaff = eligible.some((member) => member.id === staffId) ? staffId : (eligible[0]?.id ?? "");

  useEffect(() => {
    if (serviceIds.length === 0 || !effectiveStaff || !date) return;
    let cancelled = false;
    void freeSlotsAction(tenantId, serviceIds, effectiveStaff, date).then((times) => {
      if (cancelled) return;
      setFree(times);
      // L'heure choisie n'est plus libre : on propose le premier créneau libre de la journée.
      if (!timeChosen) {
        setTime((current) => (times.length > 0 && !times.includes(current) ? times[0] : current));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, serviceIds, effectiveStaff, date, timeChosen]);

  useEffect(() => {
    if (mode !== "existing" || query.trim().length < 2) return;
    const timer = setTimeout(() => void searchCustomersAction(tenantId, query).then(setFound), 250);
    return () => clearTimeout(timer);
  }, [tenantId, query, mode]);

  // Prestations regroupées par catégorie, dans l'ordre du catalogue ; la recherche filtre la liste.
  const needle = fold(serviceQuery.trim());
  const groups: { name: string | null; items: Props["services"] }[] = [];
  for (const service of services) {
    if (needle && !fold(`${service.name} ${service.category ?? ""}`).includes(needle)) continue;
    const group = groups.find((item) => item.name === service.category);
    if (group) group.items.push(service);
    else groups.push({ name: service.category, items: [service] });
  }
  const selected = services.filter((service) => serviceIds.includes(service.id));
  const toggle = (id: string, checked: boolean) => {
    setServiceIds(checked ? [...serviceIds, id] : serviceIds.filter((value) => value !== id));
    if (checked) setListOpen(false);
  };
  /** Durée lisible : « 45 min », « 1 h », « 1 h 10 ». */
  const duration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h === 0 ? t("durationM", { m }) : m === 0 ? t("durationH", { h }) : t("durationHM", { h, m });
  };

  const chip =
    "relative cursor-pointer rounded-[var(--radius-card)] border-2 px-4 py-3 has-[:checked]:border-navy has-[:checked]:bg-navy has-[:checked]:text-white";
  const step = "flex items-center gap-2 text-lg font-semibold text-night";
  const number =
    "flex size-7 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white";

  return (
    <ActionForm action={createManualAction} submitLabel={t("submit")} className="space-y-8">
      <input type="hidden" name="tenantId" value={tenantId} />

      {/* 1. La cliente : le plus souvent déjà connue, on la cherche d'abord. */}
      <fieldset className="min-w-0 space-y-3">
        <legend className={step}>
          <span className={number}>1</span>
          {t("customer")}
        </legend>
        {mode === "existing" ? (
          <div className="space-y-2">
            {customer && <input type="hidden" name="customerId" value={customer.id} />}
            <label htmlFor="m-search" className="sr-only">
              {t("search")}
            </label>
            <input
              id="m-search"
              type="search"
              placeholder={t("search")}
              value={customer ? customer.name : query}
              onChange={(event) => {
                setCustomer(null);
                setQuery(event.target.value);
              }}
              className={`${ui.input} ${customer ? "border-navy font-semibold" : ""}`}
            />
            {!customer && query.trim().length >= 2 && found.length > 0 && (
              <ul className="divide-y divide-navy/10 rounded-[var(--radius-card)] border border-navy/10 bg-white">
                {found.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setCustomer({
                          id: item.id,
                          name: [item.firstName, item.lastName].filter(Boolean).join(" "),
                        })
                      }
                      className="block min-h-11 w-full px-4 py-3 text-left hover:bg-mist-50"
                    >
                      <span className="font-semibold">
                        {[item.firstName, item.lastName].filter(Boolean).join(" ")}
                      </span>
                      {item.phone && <span className="ml-2 text-sm text-ink/60">{item.phone}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => {
                setCustomer(null);
                setMode("new");
              }}
              className="inline-flex min-h-11 items-center font-semibold text-night underline"
            >
              + {t("newCustomer")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {(["firstName", "lastName", "phone", "email"] as const).map((field) => (
                <div key={field}>
                  <label htmlFor={`m-${field}`} className={ui.label}>
                    {t(field)}
                  </label>
                  <input
                    id={`m-${field}`}
                    name={field}
                    type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
                    autoComplete="off"
                    required={field === "firstName"}
                    className={ui.input}
                  />
                </div>
              ))}
            </div>
            {/* Anniversaire (jour et mois, sans l'année) : facultatif, pour l'offre anniversaire. */}
            <fieldset>
              <legend className={ui.label}>{tCustomers("birthday")}</legend>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
                <label htmlFor="m-birthDay" className="sr-only">
                  {tCustomers("birthdayDay")}
                </label>
                <select id="m-birthDay" name="birthDay" defaultValue="" className={ui.input}>
                  <option value="">{tCustomers("birthdayDay")}</option>
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
                <label htmlFor="m-birthMonth" className="sr-only">
                  {tCustomers("birthdayMonth")}
                </label>
                <select id="m-birthMonth" name="birthMonth" defaultValue="" className={ui.input}>
                  <option value="">{tCustomers("birthdayMonth")}</option>
                  {birthMonthNames(locale).map((item) => (
                    <option key={item.month} value={item.month}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-sm text-ink/60">{tCustomers("birthdayHint")}</p>
            </fieldset>
            <button
              type="button"
              onClick={() => setMode("existing")}
              className="inline-flex min-h-11 items-center font-semibold text-night underline"
            >
              {t("searchExisting")}
            </button>
          </div>
        )}
      </fieldset>

      {/* 2. Les prestations, regroupées par catégorie, avec une recherche. */}
      <fieldset className="min-w-0 space-y-3">
        <legend className={step}>
          <span className={number}>2</span>
          {t("services")}
        </legend>
        {selected.length > 0 && (
          <p className="text-sm font-semibold text-night">
            {t("selected", {
              names: selected.map((service) => service.name).join(", "),
              duration: duration(selected.reduce((sum, service) => sum + service.durationMinutes, 0)),
            })}
          </p>
        )}
        {selected.length > 0 && !listOpen && (
          <button
            type="button"
            onClick={() => setListOpen(true)}
            className="inline-flex min-h-11 items-center font-semibold text-night underline"
          >
            {t("changeServices")}
          </button>
        )}
        <div className={selected.length > 0 && !listOpen ? "hidden" : "space-y-3"}>
          {services.length > 6 && (
            <>
              <label htmlFor="m-service-search" className="sr-only">
                {t("searchService")}
              </label>
              <input
                id="m-service-search"
                type="search"
                placeholder={t("searchService")}
                value={serviceQuery}
                onChange={(event) => setServiceQuery(event.target.value)}
                className={ui.input}
              />
            </>
          )}
          {groups.map((group) => (
            <div key={group.name ?? "other"} className="space-y-2">
              {group.name && (
                <p className="text-sm font-semibold tracking-wide text-ink/60 uppercase">{group.name}</p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {group.items.map((service) => (
                  <label key={service.id} className={`${chip} flex justify-between gap-2 border-navy/15`}>
                    <input
                      type="checkbox"
                      checked={serviceIds.includes(service.id)}
                      onChange={(event) => toggle(service.id, event.target.checked)}
                      className="sr-only"
                    />
                    <span className="font-semibold">{service.name}</span>
                    <span className="shrink-0 text-sm whitespace-nowrap opacity-80">
                      {duration(service.durationMinutes)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* Prestations choisies, envoyées même quand la recherche les masque. */}
        {serviceIds.map((id) => (
          <input key={id} type="hidden" name="serviceIds" value={id} />
        ))}
      </fieldset>

      {/* 3. Quand : la date, puis un créneau libre à toucher. */}
      <fieldset className="min-w-0 space-y-3">
        <legend className={step}>
          <span className={number}>3</span>
          {t("when")}
        </legend>
        {eligible.length > 1 ? (
          <div>
            <label htmlFor="m-staff" className={ui.label}>
              {t("staff")}
            </label>
            <select
              id="m-staff"
              name="staffId"
              value={effectiveStaff}
              onChange={(event) => setStaffId(event.target.value)}
              className={ui.input}
              required
            >
              {eligible.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <input type="hidden" name="staffId" value={effectiveStaff} />
            {eligible[0] && staff.length > 1 && (
              <p className="text-sm text-ink/70">{t("withStaff", { name: eligible[0].name })}</p>
            )}
          </>
        )}
        <div>
          <label htmlFor="m-date" className={ui.label}>
            {t("date")}
          </label>
          <input
            id="m-date"
            name="date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={ui.input}
            required
          />
        </div>
        <input type="hidden" name="time" value={time} />
        {serviceIds.length === 0 ? (
          <p className="text-sm text-ink/70">{t("pickServicesFirst")}</p>
        ) : (
          free !== null && (
            <div>
              <p className="mb-2 text-sm font-semibold text-night">{t("freeSlots")}</p>
              {free.length === 0 ? (
                <p className="text-sm text-ink/70">{t("noFreeSlots")}</p>
              ) : (
                <div className="space-y-3">
                  {PERIODS.map((period) => {
                    const slots = free.filter((slot) => period.test(Number(slot.slice(0, 2))));
                    if (slots.length === 0) return null;
                    return (
                      <div key={period.key}>
                        <p className="mb-1 text-[0.8125rem] font-semibold tracking-wide text-ink/60 uppercase">
                          {t(`periods.${period.key}`)}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {slots.map((slot) => (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => {
                                setTime(slot);
                                setTimeChosen(true);
                              }}
                              aria-pressed={time === slot}
                              className="min-h-11 rounded-full border-2 border-navy/15 px-4 font-semibold text-night tabular-nums aria-pressed:border-navy aria-pressed:bg-navy aria-pressed:text-white"
                            >
                              {slot}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )
        )}
        {/* Heure hors créneaux libres (rendez-vous exceptionnel) : repliée par défaut. */}
        <details className="group" open={free !== null && free.length === 0}>
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-night underline">
            {t("otherTime")}
          </summary>
          <div className="mt-2 max-w-48">
            <label htmlFor="m-time" className={ui.label}>
              {t("time")}
            </label>
            <input
              id="m-time"
              type="time"
              step={300}
              value={time}
              onChange={(event) => {
                setTime(event.target.value);
                setTimeChosen(true);
              }}
              className={ui.input}
            />
          </div>
        </details>
      </fieldset>

      <details>
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-night underline">
          {t("addNote")}
        </summary>
        <div className="mt-2">
          <label htmlFor="m-note" className={ui.label}>
            {t("note")}
          </label>
          <textarea id="m-note" name="internalNote" rows={2} className={ui.input} />
        </div>
      </details>
    </ActionForm>
  );
}
