/**
 * Classes partagées des éléments d'interface du SaaS (espaces gérante et admin,
 * commande, connexion) : la charte de docs/design-horaneo.md en version sobre —
 * bouton principal de l'accent (bleu indigo), bouton secondaire blanc à filet,
 * champs et cartes blancs à filet fin, coins arrondis modérés.
 */
export const ui = {
  primaryButton:
    "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-base font-medium text-white shadow-[0_1px_2px_rgba(15,24,48,.08)] transition hover:bg-accent-strong disabled:opacity-60 disabled:shadow-none",
  secondaryButton:
    "inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-hairline bg-white px-6 py-3 text-base font-medium text-night transition hover:border-accent-line hover:text-accent disabled:opacity-60",
  input:
    "block min-h-12 w-full rounded-xl border border-hairline bg-white px-4 py-3 text-base text-ink placeholder:text-ink-soft/60 transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10",
  label: "mb-2 block font-medium text-night",
  card: "rounded-[1.4rem] border border-hairline bg-white p-5 shadow-[0_1px_2px_rgba(15,24,48,.04)] sm:p-6",
  error: "rounded-xl bg-[#fdecea] px-4 py-3 text-[#8f2a20]",
  success: "rounded-xl bg-[#e7f6ee] px-4 py-3 text-[#1b5e3d]",
};
