"use client";

import { useEffect, useRef } from "react";

/**
 * Filtres repliés sur téléphone (seule la recherche reste visible), toujours dépliés sur
 * ordinateur ; dépliés aussi dès qu'un filtre est choisi.
 */
export function FiltersDisclosure({
  summary,
  active,
  children,
}: {
  summary: string;
  active: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current && window.matchMedia("(min-width: 640px)").matches) ref.current.open = true;
  }, []);
  return (
    <details ref={ref} open={active} className="group">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-night sm:hidden">
        {summary}
        <span aria-hidden="true" className="text-navy/50 transition group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="mt-2 sm:mt-0">{children}</div>
    </details>
  );
}
