/** Classes partagées des éléments d'interface du SaaS (palette Horaneo). */
export const ui = {
  primaryButton:
    "inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-card)] bg-coral px-6 py-3 text-lg font-bold text-white hover:bg-coral-dark disabled:opacity-60",
  secondaryButton:
    "inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-[var(--radius-card)] border-2 border-navy/15 bg-white px-6 py-3 text-lg font-semibold text-navy hover:border-navy/40 disabled:opacity-60",
  input:
    "block min-h-12 w-full rounded-[var(--radius-card)] border-2 border-navy/15 bg-white px-4 py-3 text-lg text-ink placeholder:text-ink/40 focus:border-navy",
  label: "mb-2 block font-semibold text-navy",
  card: "rounded-[var(--radius-card)] bg-white p-6 shadow-sm sm:p-8",
  error: "rounded-[var(--radius-card)] bg-coral/10 px-4 py-3 text-ink",
  success: "rounded-[var(--radius-card)] bg-success/10 px-4 py-3 text-ink",
};
