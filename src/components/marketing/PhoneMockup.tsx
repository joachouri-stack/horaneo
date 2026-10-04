import { getTranslations } from "next-intl/server";

/**
 * Visuel d'une réservation en cours, construit en HTML et CSS (pas une image) :
 * net à toutes les tailles et traduit avec le reste de la page.
 * Les montants sont un exemple.
 */
export async function PhoneMockup({ locale }: { locale: string }) {
  const t = await getTranslations("home.mockup");
  const money = (cents: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
      cents / 100,
    );
  const days = t.raw("days") as string[];
  const times = t.raw("times") as string[];
  return (
    <figure className="relative mx-auto w-full max-w-[300px]" aria-label={t("label")}>
      <div className="rounded-[2.5rem] bg-navy p-3 shadow-2xl">
        <div className="overflow-hidden rounded-[2rem] bg-[#f7f3ee]">
          <div className="mx-auto mt-2 h-5 w-24 rounded-full bg-navy" aria-hidden="true" />
          <div className="space-y-4 p-5 text-[#2f3b2f]">
            <p className="font-display text-xl font-extrabold text-[#2f5d50]">{t("business")}</p>
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="font-bold">{t("service")}</p>
              <p className="text-sm text-[#5b6b5b]">
                {t("duration")} · {money(6000)}
              </p>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#5b6b5b]">{t("day")}</p>
              <div className="flex gap-2">
                {days.map((day, index) => (
                  <span
                    key={day}
                    className={`flex-1 rounded-xl px-1 py-2 text-center text-sm font-semibold ${index === 1 ? "bg-[#2f5d50] text-white" : "bg-white"}`}
                  >
                    {day}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#5b6b5b]">{t("time")}</p>
              <div className="grid grid-cols-2 gap-2">
                {times.map((time, index) => (
                  <span
                    key={time}
                    className={`rounded-xl py-2 text-center text-sm font-semibold ${index === 2 ? "bg-[#2f5d50] text-white" : "bg-white"}`}
                  >
                    {time}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-white p-3 text-sm">
              <span>{t("deposit")}</span>
              <span className="text-base font-extrabold">{money(1800)}</span>
            </div>
            <span className="block rounded-2xl bg-[#2f5d50] py-3 text-center font-bold text-white">
              {t("pay")}
            </span>
          </div>
        </div>
      </div>
    </figure>
  );
}
