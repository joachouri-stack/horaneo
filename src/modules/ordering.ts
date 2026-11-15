/**
 * Changement de place d'un élément dans une liste ordonnée (« monter » ou
 * « descendre ») : renvoie les nouvelles positions à enregistrer, ou une liste
 * vide quand l'élément est déjà au bout. `null` : élément absent de la liste.
 */
export function reorderedPositions<T extends { id: string; sortOrder: number }>(
  list: T[],
  id: string,
  direction: "up" | "down",
): { id: string; sortOrder: number }[] | null {
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return [];
  const order = [...list];
  [order[index], order[target]] = [order[target], order[index]];
  return order
    .map((item, position) => ({ id: item.id, sortOrder: position, changed: item.sortOrder !== position }))
    .filter((item) => item.changed)
    .map(({ id: itemId, sortOrder }) => ({ id: itemId, sortOrder }));
}
