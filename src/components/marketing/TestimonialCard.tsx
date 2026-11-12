import type { ShowcaseEntry } from "@/config/defaults";
import { ArrowLine } from "./line-icons";

/** Témoignage réel d'un client (saisi dans l'admin) : citation, auteur, établissement et son site. */
export function TestimonialCard({ entry, visitLabel }: { entry: ShowcaseEntry; visitLabel: string }) {
  return (
    <figure className="flex h-full flex-col rounded-2xl border border-hairline bg-white p-5 shadow-[0_1px_2px_rgba(15,24,48,.04)] lg:p-6">
      <span aria-hidden="true" className="font-display text-4xl leading-none text-coral">
        “
      </span>
      <blockquote className="mt-2 flex-1 text-mk-body leading-relaxed text-night">{entry.quote}</blockquote>
      <figcaption className="mt-5 border-t border-hairline pt-4 text-mk-small text-ink-soft">
        <span className="block font-semibold text-night">{entry.author}</span>
        {entry.name} · {entry.activity}
        {entry.url && (
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex w-fit items-center gap-1 font-medium text-accent-strong underline-offset-4 hover:underline"
          >
            {visitLabel}
            <ArrowLine className="size-4" />
          </a>
        )}
      </figcaption>
    </figure>
  );
}
