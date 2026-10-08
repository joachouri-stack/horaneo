"use client";

import { type ReactNode, useId, useState } from "react";
import { ArrowIcon } from "./icons";

/**
 * Liste d'une carte de pack : les lignes visibles, et un vrai bouton qui
 * déplie la liste complète (puis la replie). Chaque carte s'ouvre seule.
 */
export function PlanDetails({
  summary,
  full,
  labels,
  className,
}: {
  summary: ReactNode;
  full: ReactNode;
  labels: { more: string; less: string };
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <div id={id}>{open ? full : summary}</div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={`mt-2 flex min-h-11 items-center gap-1.5 text-left text-[0.9rem] font-semibold ${className}`}
      >
        {open ? labels.less : labels.more}
        <ArrowIcon className={`size-4 transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
    </div>
  );
}
