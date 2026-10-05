import Image from "next/image";
import { getTranslations } from "next-intl/server";

type Live = { title: string; detail: string };

/**
 * Visuel de l'accroche : photo, notifications qui se relaient (réservation,
 * acompte, rappel) et carte de réservation. Purement décoratif : lu une seule
 * fois par les lecteurs d'écran grâce au texte de remplacement de la photo.
 */
export async function HeroVisual() {
  const [t, tLanding] = await Promise.all([getTranslations("home"), getTranslations("landing")]);
  const live = tLanding.raw("live") as Live[];
  const days = t.raw("demo.days") as string[];
  const times = t.raw("demo.times") as string[];
  return (
    <div className="hn-up-late relative min-w-0 flex-[1_1_22rem] pr-6 pt-6">
      <div aria-hidden="true" className="absolute right-0 top-0 size-48 rounded-full bg-blush-strong" />
      <div
        aria-hidden="true"
        className="absolute bottom-16 right-[0.2rem] size-[4.5rem] rounded-full border-[0.9rem] border-navy"
      />
      <div className="relative overflow-hidden rounded-[2.25rem_2.25rem_2.25rem_6rem] shadow-[0_40px_80px_-30px_rgba(27,42,74,.45)]">
        <Image
          src="/marketing/hero.jpg"
          alt={t("heroImageAlt")}
          width={1100}
          height={733}
          priority
          sizes="(min-width: 1024px) 45vw, 100vw"
          className="block h-[26rem] w-full object-cover sm:h-[32rem]"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-navy/25 via-transparent" />
      </div>

      <div aria-hidden="true">
        <div className="hn-float-alt absolute right-1 top-12">
          <div className="hn-cycle grid [&>*]:[grid-area:1/1]">
            {live.map((item, index) => (
              <div
                key={item.title}
                className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/85 px-4 py-3 shadow-[0_12px_30px_rgba(22,24,29,.18)] backdrop-blur-md"
              >
                <span className="relative flex size-3">
                  <span
                    className={`hn-ping absolute inline-flex size-full rounded-full ${index === 1 ? "bg-brick" : "bg-success"}`}
                  />
                  <span
                    className={`relative inline-flex size-3 rounded-full ${index === 1 ? "bg-brick" : "bg-success"}`}
                  />
                </span>
                <div>
                  <p className="text-[0.85rem] font-semibold text-night">{item.title}</p>
                  <p className="text-[0.8rem] text-stone">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="hn-float absolute -bottom-11 left-4 w-[17.5rem] max-w-[calc(100%-2rem)] rounded-[1.4rem] border border-white/70 bg-white/90 p-5 shadow-[0_20px_44px_rgba(22,24,29,.2)] backdrop-blur-md">
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <p className="font-semibold text-night">{t("demo.service")}</p>
              <p className="text-[0.82rem] text-stone">{t("demo.duration")}</p>
            </div>
            <p className="font-semibold text-night">{t("demo.price")}</p>
          </div>
          {[days, times].map((row, rowIndex) => (
            <div
              key={rowIndex}
              className={`grid grid-cols-4 gap-1.5 text-center text-[0.8rem] ${rowIndex === 0 ? "mb-2" : "mb-3"}`}
            >
              {row.map((label, index) => (
                <span
                  key={label}
                  className={`rounded-[0.6rem] py-1.5 ${index === (rowIndex === 0 ? 1 : 2) ? "bg-brick text-white shadow-[0_6px_14px_-4px_rgba(212,64,47,.6)]" : "bg-sand"}`}
                >
                  {label}
                </span>
              ))}
            </div>
          ))}
          <p className="flex items-center justify-between gap-2.5 rounded-[0.9rem] bg-blush px-3.5 py-2.5 text-[0.88rem] text-rust">
            <span>{t("demo.deposit")}</span>
            <span className="font-semibold">{t("demo.paid")}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
