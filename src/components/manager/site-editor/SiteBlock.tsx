"use client";

import { useId, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";

const CARD = "rounded-[1.4rem] border border-hairline bg-white transition";
const HEAD = "flex w-full min-h-16 items-center gap-3 px-4 py-3 text-left";

function Icon({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-10 flex-none items-center justify-center rounded-xl bg-accent-soft text-accent"
    >
      {children}
    </span>
  );
}

function Heading({ title, summary }: { title: string; summary?: ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block font-semibold text-night">{title}</span>
      {summary && <span className="mt-0.5 block truncate text-sm text-ink/70">{summary}</span>}
    </span>
  );
}

/**
 * Un bloc du site (Accueil, Photos…) : fermé, il montre un résumé ; ouvert, il se modifie sur place.
 * L'état ouvert est gardé après un enregistrement (la page se met à jour sans se recharger).
 */
export function SiteBlock({
  title,
  summary,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: ReactNode;
  icon: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <section
      className={`${CARD} ${open ? "border-accent/30 shadow-[0_10px_28px_-18px_rgba(59,91,246,.55)]" : ""}`}
    >
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className={`${HEAD} rounded-[1.4rem] hover:bg-mist-50`}
        >
          <Icon>{icon}</Icon>
          <Heading title={title} summary={open ? undefined : summary} />
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={`size-5 flex-none text-ink/50 transition ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h2>
      <div id={panelId} hidden={!open} className="space-y-4 border-t border-hairline px-4 pb-5 pt-4">
        {children}
      </div>
    </section>
  );
}

/** Bloc qui mène à une page à part (prestations, horaires détaillés…), avec son résumé. */
export function SiteBlockLink({
  title,
  summary,
  icon,
  href,
}: {
  title: string;
  summary?: ReactNode;
  icon: ReactNode;
  href: string;
}) {
  return (
    <section className={CARD}>
      <h2>
        <Link href={href} className={`${HEAD} rounded-[1.4rem] hover:bg-mist-50`}>
          <Icon>{icon}</Icon>
          <Heading title={title} summary={summary} />
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-5 flex-none text-ink/50"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
      </h2>
    </section>
  );
}
