import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import type { PlanFeatures } from "@/db/schema";

/** Pictogrammes des rubriques (traits, même style que les onglets du bas). */
const ICONS = {
  stats: "M3 3v18h18M7 15l4-4 3 3 5-6",
  team: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 19v-1a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75",
  calendar:
    "M8 3v4M16 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01",
  unavailability:
    "M8 3v4M16 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2M10 14l4 4M14 14l-4 4",
  promotions: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8M7.5 7.5h.01",
  promo:
    "M3 9a3 3 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a3 3 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1zM14 5v2M14 11v2M14 17v2",
  giftCards:
    "M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7",
  loyalty:
    "M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z",
  payments: "M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 10h20M6 15h4",
  subscription: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6",
  settings: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M16 16v4",
  requests: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  customerData: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10",
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01",
} as const;

type Key = keyof typeof ICONS;

/** `feature` : rubrique affichée seulement si le pack de l'établissement la comprend. */
type Item = { key: Key; href: string; feature?: keyof PlanFeatures };

const GROUPS: { key: "activity" | "sell" | "account" | "support"; items: Item[] }[] = [
  {
    key: "activity",
    items: [
      { key: "stats", href: "/plus/statistiques" },
      { key: "team", href: "/plus/equipe" },
      { key: "unavailability", href: "/indisponibilites" },
      { key: "calendar", href: "/plus/agenda-telephone" },
    ],
  },
  {
    key: "sell",
    items: [
      { key: "promotions", href: "/plus/promotions", feature: "promotions" },
      { key: "promo", href: "/plus/codes-promo", feature: "promoCodes" },
      { key: "giftCards", href: "/plus/cartes-cadeaux", feature: "giftCards" },
      { key: "loyalty", href: "/plus/fidelite", feature: "loyalty" },
    ],
  },
  {
    key: "account",
    items: [
      { key: "payments", href: "/plus/paiements", feature: "onlinePayment" },
      { key: "subscription", href: "/plus/abonnement" },
      { key: "settings", href: "/plus/reglages" },
    ],
  },
  {
    key: "support",
    items: [
      { key: "requests", href: "/plus/demandes" },
      { key: "customerData", href: "/plus/donnees-clientes", feature: "customerSpace" },
      { key: "help", href: "/plus/aide" },
    ],
  },
];

/** Onglet « Plus » : les autres rubriques, rangées par thème. */
export default async function MorePage({ params }: PageProps<"/[locale]/espace/[tenantId]/plus">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.more");
  return (
    <div className="space-y-6">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
        {t("title")}
      </h1>
      {GROUPS.map((group) => ({
        ...group,
        // Pas de rubrique pour une fonction que le pack ne comprend pas : le menu reste court.
        items: group.items.filter((item) => !item.feature || page.tenant.features[item.feature]),
      }))
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section key={group.key} aria-labelledby={`more-${group.key}`}>
            <h2
              id={`more-${group.key}`}
              className="mb-2 text-sm font-semibold tracking-wide text-ink/60 uppercase"
            >
              {t(`groups.${group.key}`)}
            </h2>
            <ul className="divide-y divide-navy/10 rounded-[var(--radius-card)] bg-white shadow-sm">
              {group.items.map((item) => (
                <li key={item.key}>
                  <Link
                    href={`${page.base}${item.href}`}
                    className="flex min-h-14 items-center gap-4 px-4 py-3 font-semibold text-night hover:bg-mist-50"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-navy/5 text-navy">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="size-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={ICONS[item.key]} />
                      </svg>
                    </span>
                    <span className="flex-1">{t(item.key)}</span>
                    <span aria-hidden="true" className="text-navy/40">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
