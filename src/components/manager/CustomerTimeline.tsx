import { getTranslations } from "next-intl/server";
import { DashIcon } from "@/components/manager/DashboardWidgets";
import { Link } from "@/i18n/navigation";
import type { TimelineEvent } from "@/modules/customers/timeline";

/** Pictogrammes de la frise (traits, même style que le reste de l'espace). */
const PATH = {
  calendar: "M8 3v4M16 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2",
  check: "M20 6 9 17l-5-5",
  cross: "M18 6 6 18M6 6l12 12",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
  star: "m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z",
  cake: "M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1M2 21h20M7 8v3M12 8v3M17 8v3",
  bag: "M5.5 8.5h13l-1 11.5h-11zM9 8.5V7a3 3 0 0 1 6 0v1.5",
  euro: "M17 6.5A7 7 0 1 0 17 17.5M4 10.5h9M4 13.5h9",
} as const;

/** Clé de traduction d'un type d'événement (sans point). */
type KindKey =
  | Exclude<TimelineEvent["kind"], `customer.${string}`>
  | (TimelineEvent["kind"] extends infer K
      ? K extends `customer.${infer R}`
        ? `customer_${R}`
        : never
      : never);

/** Pictogramme et couleur de chaque type d'événement. */
const STYLE: Record<TimelineEvent["kind"], { icon: keyof typeof PATH; tone: string }> = {
  booked_online: { icon: "calendar", tone: "bg-accent-soft text-accent-strong" },
  booked_manual: { icon: "calendar", tone: "bg-accent-soft text-accent-strong" },
  attended: { icon: "check", tone: "bg-success/15 text-success" },
  no_show: { icon: "cross", tone: "bg-[#fdecea] text-[#b4372a]" },
  cancelled: { icon: "cross", tone: "bg-mist-50 text-ink-soft" },
  "customer.confirmation": { icon: "mail", tone: "bg-mist-50 text-ink-soft" },
  "customer.reminder_email": { icon: "bell", tone: "bg-mist-50 text-ink-soft" },
  "customer.reminder_sms": { icon: "bell", tone: "bg-mist-50 text-ink-soft" },
  "customer.rescheduled": { icon: "calendar", tone: "bg-mist-50 text-ink-soft" },
  "customer.moved": { icon: "calendar", tone: "bg-mist-50 text-ink-soft" },
  "customer.cancelled": { icon: "mail", tone: "bg-mist-50 text-ink-soft" },
  "customer.review_request": { icon: "star", tone: "bg-[#fdf3e2] text-[#8a5212]" },
  "customer.payment_refunded": { icon: "euro", tone: "bg-mist-50 text-ink-soft" },
  "customer.birthday": { icon: "cake", tone: "bg-[#fbe8ee] text-[#9c3458]" },
  shop_order: { icon: "bag", tone: "bg-[#e3f4ee] text-[#1f7a5f]" },
};

/**
 * Frise « Suivi du client » : chaque événement avec son pictogramme, sa date et,
 * pour un rendez-vous, un lien vers sa fiche. Les plus récents en haut.
 */
export async function CustomerTimeline({
  events,
  base,
  fmt,
}: {
  events: TimelineEvent[];
  base: string;
  fmt: {
    date: (value: Date) => string;
    dateTime: (value: Date) => string;
    money: (cents: number, currency?: string) => string;
  };
}) {
  const t = await getTranslations("manager.customers.timeline");
  if (events.length === 0) return <p className="text-ink/70">{t("empty")}</p>;
  return (
    <ol className="relative space-y-1">
      {events.map((event, index) => {
        const style = STYLE[event.kind];
        // Clés de traduction sans point (« customer.confirmation » → « customer_confirmation »).
        const key = event.kind.replace(".", "_") as KindKey;
        const label = t(`kinds.${key}`, {
          amount: event.amountCents !== undefined ? fmt.money(event.amountCents, event.currency) : "",
        });
        const channel = event.channel ? t("channel", { channel: event.channel }) : "";
        const detail = event.appointmentAt
          ? t("forAppointment", { date: fmt.dateTime(event.appointmentAt) })
          : null;
        const content = (
          <>
            <span
              className={`relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${style.tone}`}
            >
              <DashIcon d={PATH[style.icon]} className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1 pt-1">
              <span className="block font-medium text-night">
                {label}
                {channel && <span className="font-normal text-ink-soft"> {channel}</span>}
              </span>
              {detail && <span className="block text-sm text-ink/70">{detail}</span>}
            </span>
            <time
              dateTime={event.at.toISOString()}
              className="shrink-0 pt-1 text-sm text-ink/70 tabular-nums"
            >
              {fmt.date(event.at)}
            </time>
          </>
        );
        return (
          <li key={event.id} className="relative">
            {/* Trait vertical qui relie les événements. */}
            {index < events.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute top-10 bottom-[-0.25rem] left-[1.6rem] w-px bg-hairline"
              />
            )}
            {event.appointmentId ? (
              <Link
                href={`${base}/rendez-vous/${event.appointmentId}`}
                className="flex items-start gap-3 rounded-xl px-2 py-2 transition hover:bg-mist-50"
              >
                {content}
              </Link>
            ) : (
              <div className="flex items-start gap-3 px-2 py-2">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
