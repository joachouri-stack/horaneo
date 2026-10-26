import { getTranslations } from "next-intl/server";
import { formatPhone } from "@/modules/phone";
import { ctaLabelKey, type SiteCta } from "@/modules/site/cta";
import { SITE_PATHS } from "@/modules/site/paths";
import { MobileBookBarSwitch, type BookBarVariant } from "./MobileBookBarSwitch";

/**
 * Barre fixe en bas de l'écran sur téléphone : « Réserver » toujours à portée de pouce,
 * avec à côté « Appeler » ou « SMS » selon le réglage du site. Sur la page d'une
 * professionnelle (site à plusieurs entreprises), ses propres numéro et réservation.
 */
export async function MobileBookBar({
  phone,
  mode = "call",
  cta,
  pages = [],
}: {
  phone: string | null;
  mode?: "call" | "sms";
  cta: SiteCta;
  /** Pages d'une professionnelle (/avec/<slug>) : son téléphone et son lien de réservation. */
  pages?: { path: string; phone: string | null; cta: SiteCta }[];
}) {
  const t = await getTranslations("site");
  const variant = (number: string | null, action: SiteCta): BookBarVariant | null => {
    if (!action) return null;
    // Réservation coupée : un seul bouton (appeler ou écrire), pas de doublon avec le téléphone.
    const showPhone = Boolean(number) && action.kind === "book";
    return {
      phone:
        showPhone && number
          ? {
              href: `${mode === "sms" ? "sms" : "tel"}:${number}`,
              label: mode === "sms" ? t("sms") : t("call"),
              ariaLabel:
                mode === "sms"
                  ? t("smsNumber", { phone: formatPhone(number) })
                  : t("callNumber", { phone: formatPhone(number) }),
            }
          : null,
      cta: { href: action.href, label: t(ctaLabelKey(action)) },
    };
  };
  const fallback = variant(phone, cta);
  const byPath = pages
    .map((page) => ({ path: page.path, variant: variant(page.phone, page.cta) }))
    .filter((page): page is { path: string; variant: BookBarVariant } => page.variant !== null);
  if (!fallback && byPath.length === 0) return null;
  return (
    <MobileBookBarSwitch
      mode={mode}
      fallback={fallback}
      pages={byPath}
      hiddenOn={[SITE_PATHS.booking, SITE_PATHS.appointment, SITE_PATHS.giftCard]}
    />
  );
}
