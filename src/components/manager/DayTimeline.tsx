import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AgendaAppointment } from "@/modules/agenda/queries";

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-[#eef0fb] text-[#2b3990]",
  pending_payment: "bg-[#fdf3e2] text-[#a8661b]",
  attended: "bg-[#e7f6ee] text-[#1e7a4c]",
  no_show: "bg-[#f1f2f5] text-ink-soft",
  cancelled: "bg-[#f1f2f5] text-ink-soft line-through",
};

/** Initiales d'un nom (avatar sans photo). */
export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

/**
 * Rendez-vous d'une journée en frise : heure, trait de la couleur du membre,
 * cliente, prestations, statut. Le prochain est mis en avant ; ceux qui sont
 * passés s'estompent.
 */
export async function DayTimeline({
  items,
  base,
  time,
  nextId,
  now,
  day,
}: {
  items: AgendaAppointment[];
  base: string;
  time: (date: Date) => string;
  nextId?: string | null;
  now: Date;
  /** Jour affiché au-dessus de l'heure (listes sur plusieurs jours). */
  day?: (date: Date) => string;
}) {
  const t = await getTranslations("manager");
  return (
    <ol className="space-y-2">
      {items.map((item) => {
        const next = item.id === nextId;
        const past = item.endsAt <= now;
        const color = item.staffColor ?? "#3a4bb8";
        return (
          <li key={item.id}>
            <Link
              href={`${base}/rendez-vous/${item.id}`}
              className={`group flex items-stretch gap-3 rounded-2xl border p-3 transition hover:border-accent-line hover:bg-[#fafbff] sm:gap-4 sm:p-3.5 ${
                next ? "border-accent/40 bg-[#f7f8ff] ring-1 ring-accent/20" : "border-hairline bg-white"
              } ${past && !next ? "opacity-60" : ""}`}
            >
              <div className="w-14 shrink-0 pt-0.5 text-right">
                {day && (
                  <span className="block text-[0.72rem] text-ink-soft first-letter:uppercase">
                    {day(item.startsAt)}
                  </span>
                )}
                <span className="block font-display text-[1.05rem] font-semibold text-night tabular-nums">
                  {time(item.startsAt)}
                </span>
                <span className="block text-[0.72rem] text-ink-soft tabular-nums">{time(item.endsAt)}</span>
              </div>
              <span
                aria-hidden="true"
                className="w-1 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-night">{item.customerName}</span>
                  {next && (
                    <span className="rounded-full bg-accent px-2 py-px text-[0.7rem] font-medium text-white">
                      {t("today.next")}
                    </span>
                  )}
                </p>
                <p className="truncate text-[0.88rem] text-ink-soft">{item.services.join(" + ")}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.78rem] text-ink-soft">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="flex size-5 items-center justify-center rounded-full text-[0.6rem] font-semibold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {initials(item.staffName)}
                    </span>
                    {item.staffName}
                  </span>
                  {item.source === "online" && <span>· {t("source.online")}</span>}
                </p>
              </div>
              <span
                className={`h-fit shrink-0 rounded-full px-2.5 py-1 text-[0.72rem] font-medium ${STATUS_STYLE[item.status] ?? ""}`}
              >
                {t(`status.${item.status}`)}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
