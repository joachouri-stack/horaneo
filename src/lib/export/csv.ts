import { strToU8, zipSync } from "fflate";

type Cell = string | number | null | undefined;

/**
 * Tableau CSV lisible directement par Excel, Numbers ou Google Sheets en français :
 * séparateur « ; », fins de ligne Windows, encodage UTF-8 annoncé (BOM).
 */
export function toCsv(headers: string[], rows: Cell[][]) {
  const cell = (value: Cell) => {
    let text = value === null || value === undefined ? "" : String(value);
    // Pas de formule exécutée à l'ouverture : toute valeur commençant par =, +, -, @, tabulation
    // ou retour est neutralisée, sauf un simple numéro de téléphone (+33 6…) ou un nombre (-12,5).
    if (/^[=+\-@\t\r]/.test(text) && !/^\+\d[\d ]*$/.test(text) && !/^-?\d+([.,]\d+)?$/.test(text))
      text = `'${text}`;
    return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers, ...rows].map((row) => row.map(cell).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Archive .zip des fichiers donnés (nom → contenu texte). */
export function toZip(files: Record<string, string>) {
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));
}
