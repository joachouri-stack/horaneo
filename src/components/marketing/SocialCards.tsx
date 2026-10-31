/**
 * Réseaux sociaux de la marque (pied de page du site commercial) : une carte par
 * réseau, cliquable dès que son adresse est renseignée dans l'admin (sinon
 * « Bientôt »). Au survol, la carte prend la couleur du logo (filet, halo, barre du bas).
 */

export type SocialNetwork = "youtube" | "tiktok" | "instagram" | "facebook";

/** url null : compte pas encore renseigné (carte affichée, sans lien). */
export type SocialCard = {
  network: SocialNetwork;
  url: string | null;
  name: string;
  label: string;
  handle: string;
};

/** Couleur de chaque logo (halo et filet au survol). */
const BRAND: Record<SocialNetwork, string> = {
  youtube: "#ef3340",
  tiktok: "#5ce1e6",
  instagram: "#e1306c",
  facebook: "#2d7ff9",
};

function NetworkLogo({ network }: { network: SocialNetwork }) {
  const common = { viewBox: "0 0 48 48", "aria-hidden": true, className: "size-10 sm:size-12" } as const;
  switch (network) {
    case "youtube":
      return (
        <svg {...common}>
          <rect x="4" y="10" width="40" height="28" rx="8" fill="currentColor" />
          <path d="M20 17.5v13l11-6.5z" fill="#111" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common}>
          <path
            d="M27 6h6c.5 4.6 3.5 7.6 8 8v6.2c-3-.1-5.7-1-8-2.6V31a11 11 0 1 1-11-11c.7 0 1.3 0 2 .2v6.4a5 5 0 1 0 3 4.4z"
            fill="currentColor"
          />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="3.4">
          <rect x="7" y="7" width="34" height="34" rx="10" />
          <circle cx="24" cy="24" r="8" />
          <circle cx="34.5" cy="13.5" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="20" fill="currentColor" />
          <path
            d="M26.5 44V30h4.6l.7-5.4h-5.3v-3.4c0-1.6.4-2.6 2.7-2.6H32v-4.8c-.5-.1-2.2-.2-4.1-.2-4.1 0-6.8 2.5-6.8 7v3.9h-4.6V30h4.6v14z"
            fill="#111"
          />
        </svg>
      );
  }
}

/** « @compte » tiré de l'adresse de la page (dernier élément du chemin). */
export function socialHandle(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const last = parts.at(-1);
    return last ? `@${decodeURIComponent(last).replace(/^@/, "")}` : new URL(url).hostname;
  } catch {
    return url;
  }
}

const CARD =
  "hn-social group relative flex h-full min-h-32 flex-col items-center justify-center gap-2 overflow-hidden rounded-[1.4rem] border border-white/15 bg-white/[0.06] px-3 py-5 sm:min-h-44 sm:gap-3 sm:py-7 text-center transition duration-300 hover:-translate-y-1 hover:border-[var(--brand)] hover:shadow-[0_18px_40px_-20px_var(--brand)] focus-visible:border-[var(--brand)] focus-visible:outline-white motion-reduce:transition-none motion-reduce:hover:translate-y-0";

export function SocialCards({ cards }: { cards: SocialCard[] }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((card, index) => {
        // --i : rang de la carte, pour qu'elles s'allument tour à tour sur écran tactile (globals.css).
        const style = { "--brand": BRAND[card.network], "--i": index } as React.CSSProperties;
        const content = (
          <>
            {/* Halo de la couleur du logo : discret au repos, il monte du bas au survol. */}
            <span
              aria-hidden="true"
              className="hn-social-halo pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-[radial-gradient(ellipse_at_50%_100%,var(--brand),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-35 group-focus-visible:opacity-35"
            />
            <span
              aria-hidden="true"
              className="hn-social-glow pointer-events-none absolute left-1/2 top-6 size-20 -translate-x-1/2 rounded-full bg-[var(--brand)] opacity-15 blur-2xl transition-opacity duration-300 group-hover:opacity-40"
            />
            <span className="relative text-[var(--brand)] transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
              <NetworkLogo network={card.network} />
            </span>
            <span className="hn-social-name relative text-[0.9375rem] font-semibold uppercase tracking-[0.18em] text-[#d5dbea] transition-colors group-hover:text-white">
              {card.name}
            </span>
            <span className="relative max-w-full truncate font-mono text-mk-note text-[#a3adc4]">
              {card.handle}
            </span>
            <span
              aria-hidden="true"
              className="hn-social-bar absolute bottom-0 left-1/2 h-[3px] w-0 -translate-x-1/2 rounded-full bg-[var(--brand)] transition-all duration-300 group-hover:w-2/3"
            />
          </>
        );
        return (
          <li key={card.network}>
            {card.url ? (
              <a
                href={card.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={card.label}
                style={style}
                className={CARD}
              >
                {content}
              </a>
            ) : (
              <div style={style} className={CARD}>
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
