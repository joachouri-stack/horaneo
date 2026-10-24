/**
 * Calcul du montant mensuel d'un abonnement : pack + options choisies.
 * Fonctions pures (sans base) : utilisées par le site commercial (calculateur),
 * la commande et les tests, pour que tous affichent exactement le même total.
 */

export type PricedOption = {
  code: string;
  /** Tarif mensuel en centimes ; null : tarif pas encore fixé (non commandable). */
  priceCents: number | null;
  /** Proposée à la vente et déjà livrée. */
  orderable: boolean;
  requires: string[];
};

/**
 * Options réellement retenues : celles demandées, plus celles dont elles ont
 * besoin (récursivement). Une option non commandable, inconnue, ou dont une
 * dépendance ne l'est pas, est écartée. Ordre : celui du catalogue.
 */
export function resolveOptions(selected: readonly string[], catalog: readonly PricedOption[]): string[] {
  const byCode = new Map(catalog.map((option) => [option.code, option]));
  const kept = new Set<string>();
  const visit = (code: string, path: Set<string>): boolean => {
    if (kept.has(code)) return true;
    const option = byCode.get(code);
    if (!option || !option.orderable || option.priceCents === null || path.has(code)) return false;
    const next = new Set(path).add(code);
    if (!option.requires.every((dependency) => visit(dependency, next))) return false;
    kept.add(code);
    return true;
  };
  for (const code of selected) visit(code, new Set());
  return catalog.filter((option) => kept.has(option.code)).map((option) => option.code);
}

/** Options à ajouter automatiquement quand on coche celle-ci (ses dépendances). */
export function dependenciesOf(code: string, catalog: readonly PricedOption[]): string[] {
  return resolveOptions([code], catalog).filter((item) => item !== code);
}

/** Options à retirer quand on décoche celle-ci (celles qui en ont besoin). */
export function dependentsOf(code: string, selected: readonly string[], catalog: readonly PricedOption[]) {
  return selected.filter((item) => item !== code && dependenciesOf(item, catalog).includes(code));
}

export function monthlyTotal(
  planPriceCents: number,
  selected: readonly string[],
  catalog: readonly PricedOption[],
) {
  const codes = resolveOptions(selected, catalog);
  const byCode = new Map(catalog.map((option) => [option.code, option]));
  const lines = codes.map((code) => ({ code, priceCents: byCode.get(code)!.priceCents ?? 0 }));
  return {
    codes,
    lines,
    optionsCents: lines.reduce((sum, line) => sum + line.priceCents, 0),
    totalCents: planPriceCents + lines.reduce((sum, line) => sum + line.priceCents, 0),
  };
}
