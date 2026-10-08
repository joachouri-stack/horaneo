import { getTranslations } from "next-intl/server";
import { CheckIcon } from "./icons";

/**
 * Visuel de l'accroche (maquette validée) : un téléphone dessiné en HTML/CSS
 * qui montre le site d'un client à l'étape du créneau, un disque rose derrière,
 * et deux petites cartes droites (« Nouvelle réservation », « Acompte reçu »)
 * qui ne cachent pas l'écran. Les données sont des exemples (traductions).
 */
export async function HeroVisual() {
  const t = await getTranslations("home.demo");
  const days = t.raw("days") as string[];
  const times = t.raw("times") as string[];
  const chip = (label: string, selected: boolean) => (
    <span
      key={label}
      className={`block rounded-[10px] py-[7px] text-center text-xs ${selected ? "bg-brick font-semibold text-white" : "bg-sand text-night"}`}
    >
      {label}
    </span>
  );
  return (
    <div
      role="img"
      aria-label={t("label")}
      className="hn-up-late relative flex min-w-0 flex-[1_1_20rem] justify-center pb-8 pt-2"
    >
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 size-[19rem] max-w-full -translate-x-1/2 sm:size-[23rem] -translate-y-1/2 rounded-full bg-blush"
      />
      <div
        aria-hidden="true"
        className="relative w-[15.5rem] rounded-[2.4rem] bg-night p-2 sm:w-[17rem] shadow-[0_30px_60px_rgba(22,24,29,.22)]"
      >
        <div className="overflow-hidden rounded-[2rem] bg-white">
          <div className="flex items-center justify-center gap-1.5 bg-sand px-2.5 py-2 text-[11px] text-body">
            <svg
              viewBox="0 0 24 24"
              className="size-[11px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
            >
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            {t("url")}
          </div>
          <div className="px-3.5 pb-4 pt-3.5">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex size-[30px] items-center justify-center rounded-full bg-navy text-[13px] font-semibold text-white">
                {t("initial")}
              </span>
              <span className="text-sm font-semibold text-night">{t("business")}</span>
            </div>
            <p className="mb-2 text-xs text-stone">{t("step")}</p>
            <div className="mb-2.5 flex items-baseline justify-between rounded-xl bg-ivory px-3 py-2.5">
              <span>
                <span className="block text-sm font-semibold text-night">{t("service")}</span>
                <span className="block text-xs text-stone">{t("duration")}</span>
              </span>
              <span className="text-[15px] font-semibold text-night">{t("price")}</span>
            </div>
            <div className="mb-1.5 grid grid-cols-4 gap-[5px]">
              {days.map((day, i) => chip(day, i === 1))}
            </div>
            <div className="mb-3 grid grid-cols-4 gap-[5px]">
              {times.map((time, i) => chip(time, i === 2))}
            </div>
            <div className="mb-2.5 flex justify-between text-[13px]">
              <span>{t("deposit")}</span>
              <span className="font-semibold text-night">{t("depositAmount")}</span>
            </div>
            <div className="rounded-[30px] bg-brick p-[11px] text-center text-sm font-semibold text-white">
              {t("pay")}
            </div>
          </div>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="absolute right-0 top-0 sm:top-[2.2rem] flex items-center gap-2.5 rounded-[0.9rem] bg-white px-3.5 py-2.5 shadow-[0_12px_28px_rgba(22,24,29,.16)]"
      >
        <span className="block size-2.5 rounded-full bg-success" />
        <div>
          <p className="text-[0.8rem] font-semibold text-night">{t("notification")}</p>
          <p className="text-xs text-stone">{t("notificationDetail")}</p>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="absolute -bottom-[1.9rem] left-1 flex items-center gap-2.5 rounded-[0.9rem] bg-white px-3.5 py-2.5 shadow-[0_12px_28px_rgba(22,24,29,.16)]"
      >
        <span className="flex size-[1.6rem] items-center justify-center rounded-full bg-success text-white">
          <CheckIcon className="size-3" />
        </span>
        <div>
          <p className="text-[0.8rem] font-semibold text-night">{t("received")}</p>
          <p className="text-xs text-stone">{t("receivedDetail")}</p>
        </div>
      </div>
    </div>
  );
}
