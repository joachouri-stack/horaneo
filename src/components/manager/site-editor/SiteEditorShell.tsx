"use client";

import { useState, type ReactNode } from "react";

type Device = "phone" | "desktop";
type Tab = "edit" | "preview";

type Labels = {
  edit: string;
  preview: string;
  phone: string;
  desktop: string;
  device: string;
  loading: string;
  frameTitle: string;
  previewTitle: string;
};

/**
 * « Mon site » : les blocs à modifier à gauche, l'aperçu du site à droite (onglets « Modifier » /
 * « Aperçu » sur téléphone). L'aperçu se recharge à chaque nouvel affichage de la page, donc après
 * chaque enregistrement (`version` change).
 */
export function SiteEditorShell({
  children,
  previewSrc,
  version,
  labels,
}: {
  children: ReactNode;
  /** Adresse du site à afficher (aucune : pas d'aperçu, la colonne de gauche prend toute la largeur). */
  previewSrc: string | null;
  version: string;
  labels: Labels;
}) {
  const [tab, setTab] = useState<Tab>("edit");
  const [device, setDevice] = useState<Device>("phone");
  // Le site met parfois quelques secondes à s'afficher : on le dit plutôt que de laisser un cadre vide.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const frameKey = `${device}-${version}`;
  const src = previewSrc ? `${previewSrc}${previewSrc.includes("?") ? "&" : "?"}v=${version}` : null;

  if (!src) return <div className="max-w-2xl space-y-3">{children}</div>;

  return (
    <div>
      {/* Téléphone : un onglet pour modifier, un autre pour voir le résultat. */}
      <div role="tablist" className="mb-4 grid grid-cols-2 rounded-full bg-navy/5 p-1 lg:hidden">
        {(["edit", "preview"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className="min-h-11 rounded-full font-semibold text-navy transition aria-selected:bg-navy aria-selected:text-white"
          >
            {labels[item]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <div className={`min-w-0 space-y-3 ${tab === "edit" ? "" : "max-lg:hidden"}`}>{children}</div>
        <section
          aria-label={labels.previewTitle}
          className={`min-w-0 rounded-[1.4rem] bg-navy/5 p-3 sm:p-4 lg:sticky lg:top-4 ${tab === "preview" ? "" : "max-lg:hidden"}`}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div role="group" aria-label={labels.device} className="inline-flex rounded-full bg-white p-1">
              {(["phone", "desktop"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={device === item}
                  onClick={() => setDevice(item)}
                  className="min-h-10 rounded-full px-4 text-sm font-semibold text-navy transition aria-pressed:bg-navy aria-pressed:text-white"
                >
                  {labels[item]}
                </button>
              ))}
            </div>
            <p className="text-sm text-ink/70 max-sm:hidden">{labels.previewTitle}</p>
          </div>
          <div className="relative flex justify-center">
            {loadedKey !== frameKey && (
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
              key={frameKey}
              src={src}
              title={labels.frameTitle}
              onLoad={() => setLoadedKey(frameKey)}
              className={
                device === "phone"
                  ? "h-[min(760px,calc(100vh-9rem))] w-[390px] max-w-full rounded-[2rem] border-[9px] border-navy bg-white shadow-xl"
                  : "h-[min(760px,calc(100vh-9rem))] w-full rounded-xl border border-navy/15 bg-white shadow-xl"
              }
            />
          </div>
        </section>
      </div>
    </div>
  );
}
