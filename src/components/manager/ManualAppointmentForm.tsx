"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  createManualAction,
  freeSlotsAction,
  searchCustomersAction,
} from "@/app/(platform)/[locale]/espace/[tenantId]/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { ui } from "@/components/ui/styles";

type Props = {
  tenantId: string;
  services: { id: string; name: string; durationMinutes: number }[];
  staff: { id: string; name: string; serviceIds: string[] }[];
  defaults: {
    date: string;
    time: string;
    staffId: string | null;
    customer: { id: string; name: string } | null;
  };
};

type Found = { id: string; firstName: string; lastName: string | null; phone: string | null };

/** Ajout d'un rendez-vous à la main (appel, passage) : en quelques gestes sur téléphone. */
export function ManualAppointmentForm({ tenantId, services, staff, defaults }: Props) {
  const t = useTranslations("manager.manual");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const eligible = staff.filter((member) => serviceIds.every((id) => member.serviceIds.includes(id)));
  const [staffId, setStaffId] = useState<string>(defaults.staffId ?? staff[0]?.id ?? "");
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [free, setFree] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"existing" | "new">(defaults.customer ? "existing" : "new");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(defaults.customer);
  const effectiveStaff = eligible.some((member) => member.id === staffId) ? staffId : (eligible[0]?.id ?? "");

  useEffect(() => {
    if (serviceIds.length === 0 || !effectiveStaff || !date) return;
    let cancelled = false;
    void freeSlotsAction(tenantId, serviceIds, effectiveStaff, date).then((times) => {
      if (!cancelled) setFree(times);
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, serviceIds, effectiveStaff, date]);

  useEffect(() => {
    if (mode !== "existing" || query.trim().length < 2) return;
    const timer = setTimeout(() => void searchCustomersAction(tenantId, query).then(setFound), 250);
    return () => clearTimeout(timer);
  }, [tenantId, query, mode]);

  const chip =
    "relative cursor-pointer rounded-[var(--radius-card)] border-2 px-4 py-3 has-[:checked]:border-navy has-[:checked]:bg-navy has-[:checked]:text-white";

  return (
    <ActionForm action={createManualAction} submitLabel={t("submit")}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <fieldset className="min-w-0">
        <legend className={ui.label}>{t("services")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((service) => (
            <label key={service.id} className={`${chip} border-navy/15 flex justify-between gap-2`}>
              <input
                type="checkbox"
                name="serviceIds"
                value={service.id}
                checked={serviceIds.includes(service.id)}
                onChange={(event) =>
                  setServiceIds(
                    event.target.checked
                      ? [...serviceIds, service.id]
                      : serviceIds.filter((id) => id !== service.id),
                  )
                }
                className="sr-only"
              />
              <span className="font-semibold">{service.name}</span>
              <span className="shrink-0 whitespace-nowrap text-sm opacity-80">
                {service.durationMinutes} min
              </span>
            </label>
          ))}
        </div>
      </fieldset>

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

      <div className="grid gap-3 min-[400px]:grid-cols-2">
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
        <div>
          <label htmlFor="m-time" className={ui.label}>
            {t("time")}
          </label>
          <input
            id="m-time"
            name="time"
            type="time"
            step={300}
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className={ui.input}
            required
          />
        </div>
      </div>

      {serviceIds.length > 0 && free !== null && (
        <div>
          <p className="mb-2 text-sm font-semibold text-night">{t("freeSlots")}</p>
          {free.length === 0 ? (
            <p className="text-sm text-ink/70">{t("noFreeSlots")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {free.slice(0, 40).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setTime(slot)}
                  aria-pressed={time === slot}
                  className="rounded-full border-2 border-navy/15 px-3 py-1 font-semibold text-night aria-pressed:bg-navy aria-pressed:text-white"
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <fieldset className="min-w-0 space-y-3">
        <legend className={ui.label}>{t("customer")}</legend>
        <div className="flex gap-2">
          {(["existing", "new"] as const).map((value) => (
            <label key={value} className={`${chip} border-navy/15 flex-1 text-center font-semibold`}>
              <input
                type="radio"
                name="customerMode"
                checked={mode === value}
                onChange={() => setMode(value)}
                className="sr-only"
              />
              {value === "existing" ? t("existing") : t("newCustomer")}
            </label>
          ))}
        </div>
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
              className={ui.input}
            />
            {!customer && found.length > 0 && (
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
                      className="block w-full px-4 py-3 text-left hover:bg-ivory"
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
          </div>
        ) : (
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
                  required={field === "firstName"}
                  className={ui.input}
                />
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <div>
        <label htmlFor="m-note" className={ui.label}>
          {t("note")}
        </label>
        <textarea id="m-note" name="internalNote" rows={2} className={ui.input} />
      </div>
    </ActionForm>
  );
}
