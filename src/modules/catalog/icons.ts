/**
 * Pictogrammes proposés pour les catégories de prestations (modèle Atelier).
 * Une liste fixe : la clé est enregistrée, le dessin est dans le composant du site.
 */
export const CATEGORY_ICONS = [
  "eye",
  "sparkles",
  "leaf",
  "hand",
  "face",
  "drop",
  "waves",
  "sun",
  "pen",
  "graduation",
  "flower",
  "heart",
  "scissors",
  "star",
] as const;

export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export function isCategoryIcon(value: unknown): value is CategoryIcon {
  return typeof value === "string" && (CATEGORY_ICONS as readonly string[]).includes(value);
}

/** Champs d'une catégorie envoyés par le formulaire (admin et gérante). */
export function categoryFields(data: FormData) {
  const text = (key: string) => String(data.get(key) ?? "").trim();
  const icon = text("icon");
  return {
    name: text("name"),
    description: text("description") || undefined,
    // Formulaire d'ajout rapide (nom seul) : pictogramme et mise en avant inchangés.
    ...(data.has("icon") ? { icon: isCategoryIcon(icon) ? icon : null } : {}),
    ...(data.has("icon") ? { isFeatured: data.get("isFeatured") === "on" } : {}),
  };
}
