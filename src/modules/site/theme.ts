import { contrastRatio, ensureContrast, HEX_COLOR, luminance, mixColors, readableTextOn } from "@/lib/colors";

/**
 * Ambiances du modèle bien-être (claire, sombre, nature), calculées à partir
 * des couleurs du client. Les contrastes sont vérifiés pour que textes et
 * boutons restent lisibles (norme WCAG : 4,5 pour un texte courant).
 */

export type ThemeKey = "light" | "dark" | "nature" | "blush";

export type SiteTheme = {
  key: ThemeKey;
  colors: {
    bg: string;
    surface: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
    button: string;
    onButton: string;
    secondary: string;
    /** Fond des cartes (blanc sur les ambiances claires). */
    card: string;
  };
  radius: string;
  displayFont: "classic" | "organic";
};

const DEFAULT_PRIMARY = "#7a5c48";
const DEFAULT_SECONDARY = "#efe7dc";

const BASES: Record<
  ThemeKey,
  { bg: string; text: string; muted: string; radius: string; displayFont: SiteTheme["displayFont"] }
> = {
  light: { bg: "#ffffff", text: "#1f1f1f", muted: "#595959", radius: "0.5rem", displayFont: "classic" },
  dark: { bg: "#141414", text: "#f3f1ee", muted: "#b8b2ab", radius: "0.25rem", displayFont: "classic" },
  nature: { bg: "#f5f1e8", text: "#25322a", muted: "#566259", radius: "1.25rem", displayFont: "organic" },
  // Rose poudré et brun chaud (modèle Atelier) : fond légèrement rosé, texte brun.
  blush: { bg: "#fcf6f4", text: "#3f2723", muted: "#6b5350", radius: "1.25rem", displayFont: "classic" },
};

export function buildTheme(
  key: ThemeKey,
  brand: { primary?: string; secondary?: string } | undefined,
): SiteTheme {
  const base = BASES[key] ?? BASES.light;
  const primary =
    brand?.primary && HEX_COLOR.test(brand.primary) ? brand.primary.toLowerCase() : DEFAULT_PRIMARY;
  const secondary =
    brand?.secondary && HEX_COLOR.test(brand.secondary) ? brand.secondary.toLowerCase() : DEFAULT_SECONDARY;
  const isDark = key === "dark";

  // Fond des blocs : une touche de la couleur secondaire (ou de la principale en sombre).
  // On réduit la teinte tant que le texte n'y reste pas très lisible (contraste ≥ 7).
  let tint = isDark ? 0.12 : key === "nature" || key === "blush" ? 0.45 : 0.3;
  let surface = mixColors(base.bg, isDark ? primary : secondary, tint);
  while (contrastRatio(base.text, surface) < 7 && tint > 0) {
    tint = Math.max(0, tint - 0.05);
    surface = mixColors(base.bg, isDark ? primary : secondary, tint);
  }
  const border = mixColors(base.bg, base.text, isDark ? 0.18 : 0.12);

  // Couleur des titres et liens : la principale, ajustée pour rester lisible sur le fond.
  const accent = ensureContrast(primary, base.bg, 4.5, base.text);

  // Bouton « Réserver » : la principale, avec un texte lisible (blanc ou foncé).
  const onButton = readableTextOn(primary);
  const button =
    contrastRatio(primary, onButton) >= 4.5
      ? primary
      : ensureContrast(primary, onButton, 4.5, onButton === "#ffffff" ? "#000000" : "#ffffff");
  // Le bouton doit aussi se distinguer du fond de page.
  const buttonVisible =
    contrastRatio(button, base.bg) >= 1.5
      ? button
      : mixColors(button, luminance(base.bg) > 0.5 ? "#000000" : "#ffffff", 0.25);

  return {
    key,
    colors: {
      bg: base.bg,
      surface,
      text: base.text,
      muted: ensureContrast(base.muted, surface, 4.5, base.text),
      border,
      accent,
      button: buttonVisible,
      onButton: readableTextOn(buttonVisible),
      secondary,
      card: isDark ? mixColors(base.bg, base.text, 0.06) : "#ffffff",
    },
    radius: base.radius,
    displayFont: base.displayFont,
  };
}

/** Variables CSS appliquées au site du client (jamais la palette du SaaS). */
export function themeCssVariables(theme: SiteTheme): Record<string, string> {
  const c = theme.colors;
  return {
    "--site-bg": c.bg,
    "--site-surface": c.surface,
    "--site-text": c.text,
    "--site-muted": c.muted,
    "--site-border": c.border,
    "--site-accent": c.accent,
    "--site-button": c.button,
    "--site-on-button": c.onButton,
    "--site-secondary": c.secondary,
    "--site-card": c.card,
    "--site-radius": theme.radius,
  };
}
