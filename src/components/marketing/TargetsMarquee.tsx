import type { ReactNode } from "react";

type Target = { key: string; label: string; icon: ReactNode };

/**
 * Métiers visés : deux rangées de pastilles qui défilent doucement en sens contraire, bords
 * fondus. Une seule ligne de hauteur par rangée au lieu d'un gros bloc de pastilles.
 * Pause au survol ; si moins de mouvement est demandé, chaque rangée se fait défiler au doigt.
 * Les copies qui assurent la boucle sont cachées aux lecteurs d'écran.
 */
export function TargetsMarquee({ items, label }: { items: Target[]; label: string }) {
  const half = Math.ceil(items.length / 2);
  const rows = [items.slice(0, half), items.slice(half)].filter((row) => row.length > 0);

  const chip = (item: Target, hidden: boolean) => (
    <li
      key={`${item.key}${hidden ? "-copie" : ""}`}
      aria-hidden={hidden || undefined}
      className={`mr-2.5 inline-flex flex-none items-center gap-2 rounded-full border border-hairline bg-white px-3.5 py-2 text-mk-small font-medium text-night shadow-[0_6px_16px_-12px_rgba(15,24,48,.35)] ${hidden ? "hn-marquee-copy" : ""}`}
    >
      <span className="text-coral">{item.icon}</span>
      {item.label}
    </li>
  );

  return (
    <div
      role="group"
      aria-label={label}
      className="hn-marquee-wrap -mx-4 space-y-2.5 [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)] sm:mx-0"
    >
      {rows.map((row, index) => (
        <div key={index} className="hn-marquee-row overflow-hidden">
          {/* Marge à droite de chaque pastille (pas de « gap ») : les deux moitiés ont la même largeur, la boucle ne saute pas. */}
          <ul className={`hn-marquee flex w-max py-1 ${index % 2 ? "hn-marquee-reverse" : ""}`}>
            {row.map((item) => chip(item, false))}
            {row.map((item) => chip(item, true))}
          </ul>
        </div>
      ))}
    </div>
  );
}
