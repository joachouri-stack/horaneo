import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AgendaAppointment } from "@/modules/agenda/queries";

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-navy/10 text-night",
  pending_payment: "bg-[#fdf3e2] text-[#a8661b]",
  attended: "bg-success/15 text-[#1e6b48]",
  no_show: "bg-ink/10 text-ink/70",
  cancelled: "bg-ink/10 text-ink/60 line-through",
};

/** Carte d'un rendez-vous dans les listes (grosse zone tactile). */
export async function AppointmentCard({
  item,
  href,
  time,
  day,
  highlight = false,
}: {
  item: AgendaAppointment;
  href: string;
  time: string;
  /** Jour du rendez-vous, au-dessus de l'heure (listes sur plusieurs jours). */
  day?: string;
  highlight?: boolean;
}) {
  const t = await getTranslations("manager");
  return (
    <Link
      href={href}
      className={`flex gap-3 rounded-[var(--radius-card)] border-l-8 bg-white p-4 shadow-sm ${highlight ? "ring-2 ring-accent" : ""}`}
      style={{ borderLeftColor: item.staffColor ?? "#1b2a4a" }}
    >
      <div className="w-16 shrink-0 font-display text-lg font-semibold text-night">
        {day && <span className="block text-xs font-semibold text-ink/60 first-letter:uppercase">{day}</span>}
        {time}
      </div>
      <div className="min-w-0 flex-1">
        {/* Étiquette au-dessus du nom : jamais coupée, même avec un nom long. */}
        {highlight && (
          <span className="mb-1 inline-block rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-white">
            {t("today.next")}
          </span>
        )}
        <p className="truncate font-semibold text-ink">{item.customerName}</p>
        <p className="truncate text-sm text-ink/70">{item.services.join(" + ")}</p>
        <p className="text-sm text-ink/60">{item.staffName}</p>
      </div>
      <span
        className={`h-fit shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${STATUS_STYLE[item.status] ?? ""}`}
      >
        {t(`status.${item.status}`)}
      </span>
    </Link>
  );
}
