import { getTranslations } from "next-intl/server";
import { formatPhone } from "@/modules/phone";
import { BookButton } from "./BookButton";
import { HideOnPaths } from "./HideOnPaths";
import { ctaLabelKey, type SiteCta } from "@/modules/site/cta";
import { SITE_PATHS } from "@/modules/site/paths";

/**
 * Barre fixe en bas de l'écran sur téléphone : « Réserver » toujours à portée de pouce,
 * avec à côté « Appeler » ou « SMS » selon le réglage du site.
 */
export async function MobileBookBar({
  phone,
  mode = "call",
  cta,
}: {
  phone: string | null;
  mode?: "call" | "sms";
  cta: SiteCta;
}) {
  const t = await getTranslations("site");
  if (!cta) return null;
  // Réservation coupée : un seul bouton (appeler ou écrire), pas de doublon avec le téléphone.
  const showPhone = Boolean(phone) && cta.kind === "book";
  return (
    <HideOnPaths prefixes={[SITE_PATHS.booking, SITE_PATHS.appointment, SITE_PATHS.giftCard]}>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-site-border bg-site-bg/95 px-4 py-3 backdrop-blur sm:hidden">
        <div className="flex gap-3">
          {showPhone && (
            <a
              href={`${mode === "sms" ? "sms" : "tel"}:${phone}`}
              aria-label={
                mode === "sms"
                  ? t("smsNumber", { phone: formatPhone(phone!) })
                  : t("callNumber", { phone: formatPhone(phone!) })
              }
              className="flex min-h-12 items-center justify-center rounded-site border border-site-border px-4 font-semibold text-site-text"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="mr-2 h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                {mode === "sms" ? (
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                ) : (
                  <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
                )}
              </svg>
              {mode === "sms" ? t("sms") : t("call")}
            </a>
          )}
          <BookButton href={cta.href} label={t(ctaLabelKey(cta))} size="md" className="flex-1" />
        </div>
      </div>
    </HideOnPaths>
  );
}
