import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** Pages regroupées sous une même entrée du menu (« À traiter », « Packs », « Paramètres »). */
const GROUPS = {
  todo: [
    { href: "/admin/commandes", key: "orders" },
    { href: "/admin/demandes", key: "requests" },
  ],
  plans: [
    { href: "/admin/packs", key: "plans" },
    { href: "/admin/options", key: "options" },
    { href: "/admin/offres", key: "launchOffers" },
  ],
  settings: [
    { href: "/admin/reglages", key: "settingsPage" },
    { href: "/admin/documents", key: "documents" },
  ],
} as const;

/** Sous-onglets en haut d'une page, avec une phrase « à quoi sert cette page ». */
export async function AdminSubNav({
  group,
  current,
  intro,
}: {
  group: keyof typeof GROUPS;
  current: string;
  intro?: string;
}) {
  const t = await getTranslations("admin.nav");
  return (
    <div className="space-y-3">
      <div className="flex w-fit gap-1 rounded-full bg-white p-1 shadow-sm">
        {GROUPS[group].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.href === current ? "page" : undefined}
            className="rounded-full px-4 py-2 text-sm font-semibold text-night aria-[current=page]:bg-navy aria-[current=page]:text-white"
          >
            {t(item.key)}
          </Link>
        ))}
      </div>
      {intro && <p className="text-ink/70">{intro}</p>}
    </div>
  );
}
