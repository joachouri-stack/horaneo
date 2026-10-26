import { getTranslations } from "next-intl/server";
import { PushSettings } from "@/components/manager/PushSettings";
import { ui } from "@/components/ui/styles";
import { vapidPublicKey } from "@/lib/push/send";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import {
  listNotifications,
  markNotificationsSeen,
  NOTIFICATION_DAYS,
  type ManagerNotification,
  type NotificationKind,
} from "@/modules/notifications/feed";

/** Pictogramme et couleur de chaque type de notification. */
const STYLE: Record<NotificationKind, { icon: string; tone: string }> = {
  new_booking: {
    icon: "M8 3v4M16 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2M9 15l2 2 4-4",
    tone: "bg-success/10 text-success",
  },
  cancelled: { icon: "M18 6 6 18M6 6l12 12", tone: "bg-[#fdecea] text-[#b4372a]" },
  rescheduled: {
    icon: "M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5",
    tone: "bg-navy/10 text-navy",
  },
  gift_card_sold: {
    icon: "M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7",
    tone: "bg-[#fdecea] text-[#b4372a]",
  },
  data_request: {
    icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h4",
    tone: "bg-navy/10 text-navy",
  },
};

/** Notifications de la gérante : annulations, réservations en ligne, reports… */
export default async function NotificationsPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/notifications">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.notifications");
  const items = await page.db(async (tx) => {
    const list = await listNotifications(tx, page.tenantId, { userId: page.userId });
    // L'administratrice qui regarde l'espace ne change pas ce que la gérante a vu.
    if (page.role !== "admin") await markNotificationsSeen(tx, page.tenantId, { userId: page.userId });
    return list;
  });

  const text = (item: ManagerNotification) => {
    const when = item.startsAt ? `${page.fmt.day(item.startsAt)} · ${page.fmt.time(item.startsAt)}` : "";
    switch (item.kind) {
      case "new_booking":
        return { title: t("newBooking", { customer: item.customer }), detail: when };
      case "cancelled":
        return { title: t("cancelled", { customer: item.customer }), detail: when };
      case "rescheduled":
        return { title: t("rescheduled", { customer: item.customer }), detail: when };
      case "gift_card_sold":
        return {
          title: t("giftCardSold", { customer: item.customer }),
          detail: item.amountCents ? page.fmt.money(item.amountCents, item.currency ?? undefined) : "",
        };
      case "data_request":
        return {
          title: t("dataRequest", { customer: item.customer }),
          detail: t(item.requestKind === "deletion" ? "dataDeletion" : "dataExport"),
        };
    }
  };
  const hrefOf = (item: ManagerNotification) =>
    item.appointmentId
      ? `${page.base}/rendez-vous/${item.appointmentId}`
      : item.kind === "gift_card_sold"
        ? `${page.base}/plus/cartes-cadeaux`
        : item.kind === "data_request"
          ? `${page.base}/plus/donnees-clientes`
          : null;
  const received = (date: Date) => `${page.fmt.short(date)} · ${page.fmt.time(date)}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-ink/70">{t("intro", { days: NOTIFICATION_DAYS })}</p>
      </div>
      {/* Réglage personnel de la gérante : pas proposé à l'administratrice qui regarde l'espace. */}
      {page.role !== "admin" && (
        <PushSettings
          tenantId={page.tenantId}
          publicKey={vapidPublicKey()}
          labels={{
            title: t("push.title"),
            intro: t("push.intro"),
            enable: t("push.enable"),
            disable: t("push.disable"),
            test: t("push.test"),
            testSent: t("push.testSent"),
            on: t("push.on"),
            off: t("push.off"),
            denied: t("push.denied"),
            unsupported: t("push.unsupported"),
            iosTitle: t("push.iosTitle"),
            iosStep1: t("push.iosStep1"),
            iosStep2: t("push.iosStep2"),
            iosStep3: t("push.iosStep3"),
            working: t("push.working"),
            error: t("push.error"),
          }}
        />
      )}
      {items.length === 0 ? (
        <p className={ui.card}>{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const { title, detail } = text(item);
            const href = hrefOf(item);
            const style = STYLE[item.kind];
            const body = (
              <>
                <span
                  aria-hidden="true"
                  className={`flex size-11 shrink-0 items-center justify-center rounded-full ${style.tone}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={style.icon} />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-night">
                    {item.unseen && <span className="sr-only">{t("new")} : </span>}
                    {title}
                  </span>
                  {detail && (
                    <span className="block text-sm first-letter:uppercase text-ink/80">{detail}</span>
                  )}
                  <span className="mt-0.5 block text-[0.8125rem] text-ink/60">
                    {t("receivedAt", { date: received(item.at) })}
                  </span>
                </span>
                {item.unseen && (
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-coral" />
                )}
              </>
            );
            const box = `flex min-h-16 items-center gap-3 rounded-[var(--radius-card)] border-2 p-3 ${
              item.unseen ? "border-accent-line bg-white" : "border-transparent bg-white/70"
            }`;
            return (
              <li key={item.id}>
                {href ? (
                  <Link href={href} className={`${box} transition hover:border-accent`}>
                    {body}
                  </Link>
                ) : (
                  <div className={box}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
