/**
 * Aperçu d'un site dans la carte d'un pack, dessiné en HTML/CSS (aucune image
 * à charger) : une fenêtre de navigateur dont le menu montre le nombre de
 * pages du pack, puis une tablette et un téléphone pour les packs suivants
 * (une présence plus complète, sur tous les écrans).
 */
export function SitePreview({
  tier,
  pages,
  tone,
  label,
  more,
}: {
  /** Rang du pack : 0 navigateur seul, 1 + téléphone, 2 + tablette et téléphone. */
  tier: number;
  pages: number | null;
  tone: "light" | "dark";
  label: string;
  more: (count: number) => string;
}) {
  const dark = tone === "dark";
  const frame = dark ? "bg-[#0f1a33] ring-1 ring-[#34466b]" : "bg-white ring-1 ring-line";
  const block = dark ? "bg-[#26375c]" : "bg-sand";
  const accent = dark ? "bg-gold" : "bg-copper";
  const shown = Math.min(pages ?? 4, 4);
  const extra = pages && pages > shown ? pages - shown : 0;

  const screen = (compact: boolean) => (
    <div className="flex h-full flex-col gap-1.5 p-2">
      <div className="flex items-center gap-1">
        <span className={`size-2 flex-none rounded-full ${accent}`} />
        {!compact && (
          <div className="ml-auto flex items-center gap-1">
            {Array.from({ length: shown }, (_, index) => (
              <span key={index} className={`h-1.5 w-4 rounded-full ${index === 0 ? accent : block}`} />
            ))}
            {extra > 0 && (
              <span
                className={`text-[0.55rem] font-semibold leading-none ${dark ? "text-gold" : "text-copper"}`}
              >
                {more(extra)}
              </span>
            )}
          </div>
        )}
      </div>
      <div className={`flex-1 rounded-md ${block}`}>
        <div className="flex h-full flex-col justify-end gap-1 p-1.5">
          <span className={`h-1.5 w-3/5 rounded-full ${dark ? "bg-white/70" : "bg-night/70"}`} />
          <span className={`h-1 w-2/5 rounded-full ${dark ? "bg-white/40" : "bg-night/30"}`} />
          <span className={`mt-0.5 h-2 w-8 rounded-full ${accent}`} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {[0, 1, 2].map((item) => (
          <span key={item} className={`h-3 rounded ${block}`} />
        ))}
      </div>
    </div>
  );

  return (
    <div role="img" aria-label={label} className="relative mt-5 h-[8.5rem]">
      <div aria-hidden="true" className="absolute inset-0">
        {/* Navigateur */}
        <div
          className={`absolute left-0 top-0 h-[7.6rem] overflow-hidden rounded-xl shadow-[0_14px_30px_-16px_rgba(22,24,29,.35)] ${frame} ${
            tier >= 2 ? "w-[68%]" : tier >= 1 ? "w-[78%]" : "w-full"
          }`}
        >
          <div className={`flex items-center gap-1 px-2 py-1.5 ${dark ? "bg-[#18264a]" : "bg-ivory"}`}>
            {[0, 1, 2].map((dot) => (
              <span key={dot} className={`size-1.5 rounded-full ${block}`} />
            ))}
            <span className={`ml-1.5 h-2 flex-1 rounded-full ${block}`} />
          </div>
          <div className="h-[calc(100%-1.4rem)]">{screen(false)}</div>
        </div>
        {/* Tablette */}
        {tier >= 2 && (
          <div
            className={`absolute bottom-0 right-[12%] h-[6.4rem] w-[30%] overflow-hidden rounded-lg border-[3px] shadow-[0_14px_30px_-14px_rgba(22,24,29,.4)] ${
              dark ? "border-[#0b1429] bg-[#0f1a33]" : "border-night bg-white"
            }`}
          >
            {screen(true)}
          </div>
        )}
        {/* Téléphone */}
        {tier >= 1 && (
          <div
            className={`absolute bottom-0 right-0 h-[5.6rem] w-[17%] min-w-[3.2rem] overflow-hidden rounded-[0.7rem] border-[3px] shadow-[0_14px_30px_-12px_rgba(22,24,29,.45)] ${
              dark ? "border-[#0b1429] bg-[#0f1a33]" : "border-night bg-white"
            }`}
          >
            {screen(true)}
          </div>
        )}
      </div>
    </div>
  );
}
