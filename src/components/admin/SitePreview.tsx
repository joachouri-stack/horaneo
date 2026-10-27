"use client";

import { useState } from "react";

type Device = "phone" | "desktop";

/**
 * Aperçu du site dans la page : vue téléphone ou ordinateur, on peut y
 * naviguer comme une visiteuse. Le lien ouvre le même aperçu dans un onglet.
 */
export function SitePreview({
  src,
  title,
  labels,
}: {
  src: string;
  title: string;
  labels: { phone: string; desktop: string; open: string; device: string; loading: string };
}) {
  const [device, setDevice] = useState<Device>("phone");
  // Le site met parfois quelques secondes à s'afficher : on le dit plutôt que de laisser un cadre vide.
  const [loading, setLoading] = useState(true);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={labels.device} className="inline-flex rounded-full bg-navy/5 p-1">
          {(["phone", "desktop"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={device === item}
              onClick={() => {
                if (item !== device) setLoading(true);
                setDevice(item);
              }}
              className="min-h-11 rounded-full px-5 font-semibold text-navy transition aria-pressed:bg-navy aria-pressed:text-white"
            >
              {labels[item]}
            </button>
          ))}
        </div>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center font-semibold text-night underline"
        >
          {labels.open} ↗
        </a>
      </div>
      <div className="relative flex justify-center rounded-[1.5rem] bg-navy/5 p-3 sm:p-6">
        {loading && (
          <p
            role="status"
            className="absolute inset-x-0 top-16 z-10 mx-auto flex w-fit items-center gap-3 rounded-full bg-white px-5 py-3 font-medium text-night shadow"
          >
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-navy/20 border-t-navy motion-reduce:animate-none"
            />
            {labels.loading}
          </p>
        )}
        <iframe
          key={device}
          src={src}
          title={title}
          onLoad={() => setLoading(false)}
          className={
            device === "phone"
              ? "h-[760px] w-[390px] max-w-full rounded-[2rem] border-[10px] border-navy bg-white shadow-xl"
              : "h-[760px] w-full rounded-xl border border-navy/15 bg-white shadow-xl"
          }
        />
      </div>
    </div>
  );
}
