import type { IcsEvent } from "./ics";

/** Rendez-vous d'une cliente, tel qu'on l'ajoute à son agenda. */
export type AppointmentEventInput = {
  id: string;
  start: Date;
  end: Date;
  services: string[];
  businessName: string;
  address?: string | null;
  manageUrl: string;
  /** Domaine du site : rend l'identifiant unique d'un agenda à l'autre. */
  host: string;
};

export function appointmentEvent(input: AppointmentEventInput): IcsEvent {
  return {
    uid: `${input.id}@${input.host}`,
    start: input.start,
    end: input.end,
    summary: [input.services.join(" + "), input.businessName].filter(Boolean).join(" · "),
    description: input.manageUrl,
    location: input.address || undefined,
    url: input.manageUrl,
  };
}

const compact = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** Lien « Google Agenda » : ouvre la fiche du rendez-vous prête à enregistrer. */
export function googleCalendarUrl(event: IcsEvent) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.summary,
    dates: `${compact(event.start)}/${compact(event.end)}`,
    details: event.description ?? "",
    location: event.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
