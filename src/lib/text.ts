/**
 * Majuscule au début (« novembre » → « Novembre »), faite dans le texte : la règle CSS
 * « first-letter » rend le mot invisible sur certains iPhone.
 */
export function capitalize(text: string, locale?: string) {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}
