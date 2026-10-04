import { getTranslations } from "next-intl/server";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";

/** Onglet « Plus » : statistiques, équipe, indisponibilités, abonnement, réglages, demandes, aide. */
export default async function MorePage({ params }: PageProps<"/[locale]/espace/[tenantId]/plus">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.more");
  const items = [
    { href: "/plus/statistiques", label: t("stats") },
    { href: "/plus/equipe", label: t("team") },
    { href: "/indisponibilites", label: t("unavailability") },
    { href: "/plus/paiements", label: t("payments") },
    { href: "/plus/codes-promo", label: t("promo") },
    { href: "/plus/promotions", label: t("promotions") },
    { href: "/plus/cartes-cadeaux", label: t("giftCards") },
    { href: "/plus/abonnement", label: t("subscription") },
    { href: "/plus/reglages", label: t("settings") },
    { href: "/plus/demandes", label: t("requests") },
    { href: "/plus/aide", label: t("help") },
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={`${page.base}${item.href}`} className={`${ui.secondaryButton} justify-between`}>
              {item.label} <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
