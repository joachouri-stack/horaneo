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
  labels: { phone: string; desktop: string; open: string; device: string };
}) {
  const [device, setDevice] = useState<Device>("phone");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={labels.device} className="inline-flex rounded-full bg-navy/5 p-1">
          {(["phone", "desktop"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={device === item}
              onClick={() => setDevice(item)}
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
      <div className="flex justify-center rounded-[1.5rem] bg-navy/5 p-3 sm:p-6">
        <iframe
          key={device}
          src={src}
          title={title}
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
