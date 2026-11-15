/**
 * Chiffre d'affaires et marges par prestation ou par produit (fonctions pures, sans base).
 *
 * La marge utilise le coût de revient ACTUEL de la prestation ou du produit (aucun
 * historique des coûts n'est gardé) : un coût modifié change aussi la marge des mois passés.
 */

/** Une vente : une prestation réalisée (quantité 1) ou un article de commande. */
export type SaleItem = { key: string; name: string; quantity: number; revenueCents: number };

export type SalesLine = {
  key: string;
  name: string;
  quantity: number;
  revenueCents: number;
  /** Coût total (coût unitaire × quantité) ; null : coût non renseigné. */
  costCents: number | null;
  /** Chiffre d'affaires − coût ; null : coût non renseigné. */
  marginCents: number | null;
};

export type SalesBreakdown = {
  lines: SalesLine[];
  revenueCents: number;
  /** Marge totale des seules lignes dont le coût est renseigné. */
  marginCents: number;
  /** Nombre de lignes dont le coût est renseigné (comptées dans la marge totale). */
  withCost: number;
};

/** Marge d'une ligne : null si le coût unitaire n'est pas renseigné. */
export function lineMargin(revenueCents: number, quantity: number, unitCostCents: number | null) {
  if (unitCostCents === null || unitCostCents === undefined) return { costCents: null, marginCents: null };
  const costCents = unitCostCents * quantity;
  return { costCents, marginCents: revenueCents - costCents };
}

/**
 * Regroupe les ventes par clé (prestation ou produit), calcule CA et marge de chaque ligne
 * (coût unitaire actuel lu dans `unitCosts`), trie par CA décroissant et totalise la marge
 * des lignes dont le coût est connu.
 */
export function salesBreakdown(items: SaleItem[], unitCosts: Map<string, number | null>): SalesBreakdown {
  const grouped = new Map<string, { name: string; quantity: number; revenueCents: number }>();
  for (const item of items) {
    const line = grouped.get(item.key) ?? { name: item.name, quantity: 0, revenueCents: 0 };
    line.quantity += item.quantity;
    line.revenueCents += item.revenueCents;
    grouped.set(item.key, line);
  }
  const lines: SalesLine[] = [...grouped.entries()]
    .map(([key, line]) => ({
      key,
      ...line,
      ...lineMargin(line.revenueCents, line.quantity, unitCosts.get(key) ?? null),
    }))
    .sort(
      (a, b) => b.revenueCents - a.revenueCents || b.quantity - a.quantity || a.name.localeCompare(b.name),
    );
  const costed = lines.filter((line) => line.marginCents !== null);
  return {
    lines,
    revenueCents: lines.reduce((sum, line) => sum + line.revenueCents, 0),
    marginCents: costed.reduce((sum, line) => sum + (line.marginCents ?? 0), 0),
    withCost: costed.length,
  };
}
