/**
 * Classes partagées des éléments d'interface du SaaS : la même charte que la page
 * d'accueil (docs/design-horaneo.md) en version sobre — boutons pilule corail foncé,
 * boutons secondaires rose clair, cartes blanches à bordure claire, titres noirs.
 */
export const ui = {
  primaryButton:
    "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brick px-6 py-3 text-lg font-bold text-white transition hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none",
  secondaryButton:
    "inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-blush px-6 py-3 text-lg font-semibold text-rust transition hover:bg-blush-strong disabled:opacity-60",
  input:
    "block min-h-12 w-full rounded-[var(--radius-card)] border-2 border-line bg-white px-4 py-3 text-lg text-ink placeholder:text-ink/40 focus:border-brick",
  label: "mb-2 block font-semibold text-night",
  card: "rounded-[1.5rem] border-2 border-line bg-white p-6 sm:p-8",
  error: "rounded-[var(--radius-card)] bg-blush px-4 py-3 text-rust",
  success: "rounded-[var(--radius-card)] bg-success/10 px-4 py-3 text-ink",
};
