"use client";

import { useEffect, useState } from "react";

/**
 * Points sous une rangée qui défile d'un geste (téléphone) : montrent la carte
 * au centre et permettent d'aller à une autre. La rangée est trouvée par son id.
 */
export function CarouselDots({
  targetId,
  count,
  label,
  className,
}: {
  targetId: string;
  /** Nombre de cartes de la rangée. */
  count: number;
  label: string;
  className?: string;
}) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const row = document.getElementById(targetId);
    if (!row) return;
    const update = () => {
      const center = row.scrollLeft + row.clientWidth / 2;
      const items = [...row.children] as HTMLElement[];
      const index = items.reduce(
        (best, item, i) =>
          Math.abs(item.offsetLeft + item.offsetWidth / 2 - center) <
          Math.abs(items[best].offsetLeft + items[best].offsetWidth / 2 - center)
            ? i
            : best,
        0,
      );
      setActive(index);
    };
    row.addEventListener("scroll", update, { passive: true });
    return () => row.removeEventListener("scroll", update);
  }, [targetId]);
  const goTo = (index: number) => {
    const row = document.getElementById(targetId);
    const item = row?.children[index] as HTMLElement | undefined;
    if (row && item)
      row.scrollTo({ left: item.offsetLeft - (row.clientWidth - item.offsetWidth) / 2, behavior: "smooth" });
  };
  if (count < 2) return null;
  return (
    <div className={`flex justify-center gap-2 ${className ?? ""}`}>
      {Array.from({ length: count }, (_, index) => (
        <button
          key={index}
          type="button"
          aria-label={label.replace("{n}", String(index + 1))}
          aria-current={index === active ? "true" : undefined}
          onClick={() => goTo(index)}
          className="flex size-11 items-center justify-center"
        >
          <span
            className={`block h-2 rounded-full transition-all ${index === active ? "w-6 bg-salmon" : "w-2 bg-white/35"}`}
          />
        </button>
      ))}
    </div>
  );
}
