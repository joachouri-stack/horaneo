import { getTranslations } from "next-intl/server";
import { CheckIcon } from "./icons";

type Appointment = { time: string; name: string; service: string };

/** Hauteurs des barres du petit graphique décoratif (en % de la hauteur). */
const BARS = [38, 52, 46, 70, 64, 88];

const CARD =
  "hn-reveal group relative flex flex-col overflow-hidden rounded-[1.75rem] border p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-20px_rgba(22,24,29,.25)] sm:p-7";

/**
 * Ce que comprend le service, en grille « bento » : chaque case montre une
 * petite interface dessinée en CSS (décorative, masquée aux lecteurs d'écran).
 */
export async function Bento() {
  const t = await getTranslations("landing");
  const agenda = t.raw("bento.agenda.items") as Appointment[];
  const methods = t.raw("bento.deposit.methods") as string[];
  const actions = t.raw("bento.manage.actions") as string[];
  const months = t.raw("bento.stats.months") as string[];

  const heading = (key: "site" | "agenda" | "reminders" | "deposit" | "manage" | "stats", light = false) => (
    <div className="relative mt-auto pt-6">
      <h3 className={`font-sans text-xl font-semibold ${light ? "text-white" : "text-night"}`}>
        {t(`bento.${key}.title`)}
      </h3>
      <p className={`hn-pretty mt-1.5 ${light ? "text-[#d7dce6]" : "text-body"}`}>{t(`bento.${key}.text`)}</p>
    </div>
  );

  return (
    <div className="grid gap-5 md:grid-cols-6">
      {/* Site à son nom : grande case */}
      <article className={`${CARD} border-line bg-white md:col-span-4`}>
        <div aria-hidden="true" className="rounded-2xl border border-line bg-ivory p-3">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-[#f0705f]" />
              <span className="size-2.5 rounded-full bg-[#f6c9c1]" />
              <span className="size-2.5 rounded-full bg-line" />
            </span>
            <span className="ml-2 flex flex-1 items-center gap-1.5 truncate rounded-full bg-white px-3 py-1 text-xs text-stone">
              <svg
                viewBox="0 0 24 24"
                className="size-3 flex-none"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              {t("bento.site.url")}
            </span>
          </div>
          <div className="grid grid-cols-[1.3fr_1fr] gap-3 rounded-xl bg-white p-4">
            <div>
              <p className="font-display text-2xl font-bold text-night">{t("bento.site.name")}</p>
              <div className="mt-2 space-y-1.5">
                <div className="h-2 w-11/12 rounded-full bg-sand" />
                <div className="h-2 w-3/4 rounded-full bg-sand" />
              </div>
              <span className="mt-4 inline-block rounded-full bg-brick px-4 py-1.5 text-xs font-semibold text-white transition group-hover:scale-105">
                {t("bento.site.cta")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-blush-strong" />
              <div className="rounded-lg bg-navy" />
              <div className="col-span-2 h-10 rounded-lg bg-[linear-gradient(120deg,var(--color-blush),var(--color-sand))]" />
            </div>
          </div>
        </div>
        {heading("site")}
      </article>

      {/* Agenda */}
      <article className={`${CARD} border-line bg-white md:col-span-2`}>
        <ul aria-hidden="true" className="space-y-2">
          {agenda.map((item, index) => (
            <li
              key={item.time}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition group-hover:translate-x-1 ${index === 0 ? "bg-navy text-white" : "bg-ivory"}`}
              style={{ transitionDelay: `${index * 60}ms` }}
            >
              <span className="font-semibold tabular-nums">{item.time}</span>
              <span className="truncate">
                {item.name} ·{" "}
                <span className={index === 0 ? "text-[#c9d0de]" : "text-stone"}>{item.service}</span>
              </span>
            </li>
          ))}
        </ul>
        {heading("agenda")}
      </article>

      {/* Rappels */}
      <article className={`${CARD} border-line bg-white md:col-span-2`}>
        <div aria-hidden="true" className="flex flex-col items-start gap-2">
          <p className="max-w-[90%] rounded-2xl rounded-bl-md bg-sand px-4 py-3 text-sm text-night">
            {t("bento.reminders.sms")}
          </p>
          <p className="self-end rounded-2xl rounded-br-md bg-success px-4 py-2.5 text-white">
            <CheckIcon className="size-4" />
          </p>
        </div>
        {heading("reminders")}
      </article>

      {/* Acompte : case sombre */}
      <article className={`${CARD} hn-grain border-navy bg-navy md:col-span-2`}>
        <div
          aria-hidden="true"
          className="absolute -right-10 -top-10 size-36 rounded-full bg-coral/30 blur-2xl transition group-hover:bg-coral/50"
        />
        <div aria-hidden="true" className="relative rounded-2xl bg-white/10 p-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="font-display text-3xl font-bold text-white">{t("bento.deposit.amount")}</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-1 text-xs font-semibold text-white">
              <CheckIcon className="size-3.5" />
              {t("bento.deposit.status")}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {methods.map((method) => (
              <span key={method} className="rounded-full bg-white/15 px-2.5 py-1 text-xs text-white">
                {method}
              </span>
            ))}
          </div>
        </div>
        {heading("deposit", true)}
      </article>

      {/* Déplacer / annuler */}
      <article className={`${CARD} border-line bg-white md:col-span-2`}>
        <div aria-hidden="true" className="flex gap-2">
          {actions.map((action, index) => (
            <span
              key={action}
              className={`flex-1 rounded-full py-2.5 text-center text-sm font-semibold ${index === 0 ? "bg-blush text-rust" : "border border-line text-night"}`}
            >
              {action}
            </span>
          ))}
        </div>
        {heading("manage")}
      </article>

      {/* Statistiques : large case */}
      <article className={`${CARD} border-line bg-white md:col-span-6 md:flex-row md:items-end md:gap-10`}>
        <div className="md:order-2 md:flex-1">{heading("stats")}</div>
        <div aria-hidden="true" className="w-full md:max-w-md">
          <div className="hn-bars flex h-36 items-end gap-3">
            {BARS.map((height, index) => (
              <div
                key={index}
                className={`flex-1 rounded-t-lg ${index === BARS.length - 1 ? "bg-brick" : "bg-blush-strong group-hover:bg-[#f0a89c]"} transition-colors`}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex gap-3 text-center text-xs text-stone">
            {months.map((month) => (
              <span key={month} className="flex-1">
                {month}
              </span>
            ))}
          </div>
        </div>
      </article>
    </div>
  );
}
