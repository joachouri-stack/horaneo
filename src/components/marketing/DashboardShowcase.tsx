import { getTranslations } from "next-intl/server";
import {
  CalendarCheckIcon,
  CardIcon,
  ChartIcon,
  InboxIcon,
  PencilIcon,
  SparkleIcon,
  BrowserIcon,
} from "./icons";

/** Ce que le tableau de bord permet, et à quelle condition (pack, option, « Bientôt »). */
export type DashboardItem = {
  key: "content" | "pages" | "requests" | "bookings" | "payments" | "stats" | "options";
  /** Étiquette déjà traduite : « Inclus », « Option Réservation en ligne », « Bientôt »… */
  tag: string;
  /** Inclus dans tous les packs (étiquette mise en valeur). */
  included: boolean;
};

const ICONS = {
  content: PencilIcon,
  pages: BrowserIcon,
  requests: InboxIcon,
  bookings: CalendarCheckIcon,
  payments: CardIcon,
  stats: ChartIcon,
  options: SparkleIcon,
} as const;

/**
 * Le tableau de bord du client, sur ordinateur et téléphone (dessinés en
 * HTML/CSS, données d'exemple), et ce qu'il permet. Chaque possibilité dit si
 * elle est incluse ou liée à une option : rien n'est promis à tous si c'est payant.
 */
export async function DashboardShowcase({ items }: { items: DashboardItem[] }) {
  const t = await getTranslations("home.dashboard");
  const menu = ["home", "services", "gallery", "contact"] as const;
  // Données d'exemple (traductions), comme l'aperçu de l'accroche.
  const stats = ["visits", "requests", "bookings"] as const;
  const times = t.raw("mock.times") as string[];
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14">
      {/* Ordinateur et téléphone */}
      <div
        role="img"
        aria-label={t("label")}
        className="relative mx-auto w-full max-w-[36rem] pb-10 pr-6 sm:pr-10"
      >
        <div aria-hidden="true" className="absolute -left-6 top-6 size-56 rounded-full bg-cream sm:size-72" />
        <div aria-hidden="true" className="relative">
          <div className="rounded-[1.1rem] bg-night p-2 shadow-[0_30px_60px_-20px_rgba(22,24,29,.45)]">
            <div className="flex overflow-hidden rounded-[0.7rem] bg-ivory">
              <div className="hidden w-[28%] flex-col gap-1.5 bg-navy p-3 sm:flex">
                <span className="mb-2 flex items-center gap-1.5 text-[0.62rem] font-semibold text-white">
                  <span className="size-3 rounded-full bg-gold" />
                  {t("mock.site")}
                </span>
                {menu.map((key, index) => (
                  <span
                    key={key}
                    className={`rounded-md px-2 py-1 text-[0.58rem] ${index === 0 ? "bg-navy-light text-white" : "text-[#c9d0de]"}`}
                  >
                    {t(`mock.${key}`)}
                  </span>
                ))}
              </div>
              <div className="flex-1 p-3 sm:p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[0.72rem] font-semibold text-night">{t("mock.hello")}</span>
                  <span className="rounded-full bg-[#dff3ea] px-2 py-0.5 text-[0.55rem] font-semibold text-success">
                    {t("mock.published")}
                  </span>
                </div>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {stats.map((key) => (
                    <span key={key} className="rounded-lg bg-white p-2 shadow-[0_1px_0_rgba(22,24,29,.06)]">
                      <span className="block font-display text-[1rem] font-bold leading-none text-night">
                        {t(`mock.values.${key}`)}
                      </span>
                      <span className="text-[0.52rem] text-stone">{t(`mock.${key}`)}</span>
                    </span>
                  ))}
                </div>
                <div className="rounded-lg bg-white p-2.5">
                  <span className="mb-2 flex items-center justify-between text-[0.6rem] font-semibold text-night">
                    {t("mock.pages")}
                    <span className="rounded-full bg-cream px-1.5 py-px text-copper">{t("mock.edit")}</span>
                  </span>
                  {[70, 52, 84].map((width) => (
                    <span key={width} className="mb-1.5 flex items-center gap-2 last:mb-0">
                      <span className="size-5 flex-none rounded bg-sand" />
                      <span className="h-1.5 rounded-full bg-sand" style={{ width: `${width}%` }} />
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex h-12 items-end gap-1 rounded-lg bg-white p-2">
                  {[30, 55, 40, 70, 60, 85, 75].map((height, index) => (
                    <span
                      key={index}
                      className={`flex-1 rounded-sm ${index === 5 ? "bg-copper" : "bg-mist-strong"}`}
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="mx-auto h-2.5 w-[86%] rounded-b-xl bg-[#2a2d35]" />
          {/* Téléphone */}
          <div className="absolute -bottom-10 -right-6 w-[34%] min-w-[7.5rem] max-w-[10rem] rounded-[1.4rem] bg-night p-1.5 shadow-[0_24px_50px_-14px_rgba(22,24,29,.5)] sm:-right-10">
            <div className="overflow-hidden rounded-[1.1rem] bg-white p-2.5">
              <span className="mb-2 block text-[0.6rem] font-semibold text-night">
                {t("mock.phoneTitle")}
              </span>
              {times.map((time, index) => (
                <span key={time} className="mb-1.5 flex items-center gap-1.5 rounded-md bg-ivory px-1.5 py-1">
                  <span className={`h-5 w-1 rounded-full ${index === 1 ? "bg-copper" : "bg-navy"}`} />
                  <span className="text-[0.55rem] font-semibold text-night">{time}</span>
                  <span className="h-1 flex-1 rounded-full bg-sand" />
                </span>
              ))}
              <span className="mt-2 block rounded-full bg-brick py-1 text-center text-[0.55rem] font-semibold text-white">
                {t("mock.edit")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Possibilités */}
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = ICONS[item.key];
          return (
            <li key={item.key} className="flex gap-3.5 rounded-[1.25rem] border-2 border-line bg-white p-4">
              <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-cream text-copper">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold leading-snug text-night">{t(`items.${item.key}.title`)}</p>
                <p className="mt-0.5 text-[0.88rem] leading-snug text-stone">{t(`items.${item.key}.text`)}</p>
                <p
                  className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold ${
                    item.included ? "bg-[#dff3ea] text-[#1f6e4b]" : "bg-sand text-stone"
                  }`}
                >
                  {item.tag}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
