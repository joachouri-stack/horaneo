/**
 * Import d'un fichier clients (CSV, par ex. « Enregistrer sous → CSV » dans Excel,
 * ou l'export d'un ancien logiciel). Fonctions sans accès à la base : utilisées
 * dans le navigateur (aperçu) comme par les tests.
 */

/** Champs d'une fiche que l'on peut remplir depuis le fichier. */
export const IMPORT_FIELDS = [
  "firstName",
  "lastName",
  "fullName",
  "phone",
  "email",
  "birthday",
  "notes",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Lignes lues au plus dans un fichier. */
export const IMPORT_MAX_ROWS = 5000;

/** Texte du fichier : UTF-8, sinon l'encodage des anciens Excel (Windows-1252). */
export function decodeFile(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Séparateur le plus présent sur la première ligne : « ; » (Excel en français), « , » ou tabulation. */
function detectSeparator(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map((sep) => ({ sep, count: firstLine.split(sep).length - 1 }));
  counts.sort((a, b) => b.count - a.count);
  return counts[0].count > 0 ? counts[0].sep : ";";
}

/** Tableau de cellules (guillemets et retours à la ligne entre guillemets gérés). Lignes vides ignorées. */
export function parseCsv(text: string): string[][] {
  const sep = detectSeparator(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === sep) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      if (rows.length > IMPORT_MAX_ROWS) break;
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows.map((cells) => cells.map((value) => value.trim()));
}

/** Titre de colonne simplifié : minuscules, sans accents ni ponctuation. */
function simplify(header: string) {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Titres reconnus pour chaque champ (simplifiés). Les premiers trouvés l'emportent. */
const SYNONYMS: Record<ImportField, string[]> = {
  firstName: ["prenom", "first name", "firstname", "given name"],
  lastName: ["nom de famille", "nom", "last name", "lastname", "surname", "family name"],
  fullName: ["nom complet", "client", "cliente", "nom prenom", "prenom nom", "name", "full name"],
  phone: ["telephone portable", "portable", "mobile", "telephone", "tel", "phone", "gsm", "cellulaire"],
  email: ["e mail", "email", "mail", "adresse e mail", "adresse mail", "courriel"],
  birthday: [
    "date de naissance",
    "naissance",
    "anniversaire",
    "birthday",
    "birth date",
    "date of birth",
    "ddn",
  ],
  notes: ["notes", "note", "remarques", "remarque", "commentaire", "commentaires", "observations", "infos"],
};

/** Colonne proposée pour chaque champ d'après les titres (null si aucune ne correspond). */
export function guessColumns(headers: string[]): Record<ImportField, number | null> {
  const simple = headers.map(simplify);
  const used = new Set<number>();
  const result = {} as Record<ImportField, number | null>;
  // Ordre : les champs aux titres les plus précis d'abord (« prénom » avant « nom »).
  for (const field of ["firstName", "email", "phone", "birthday", "notes", "fullName", "lastName"] as const) {
    let found: number | null = null;
    for (const synonym of SYNONYMS[field]) {
      const index = simple.findIndex((header, i) => !used.has(i) && header === synonym);
      if (index >= 0) {
        found = index;
        break;
      }
    }
    if (found === null) {
      const index = simple.findIndex(
        (header, i) =>
          !used.has(i) && SYNONYMS[field].some((synonym) => synonym.length > 3 && header.includes(synonym)),
      );
      if (index >= 0) found = index;
    }
    if (found !== null) used.add(found);
    result[field] = found;
  }
  // Un prénom et un nom séparés : pas de colonne « nom complet ».
  if (result.firstName !== null && result.fullName !== null && result.lastName === null) {
    result.lastName = result.fullName;
    result.fullName = null;
  }
  return result;
}

/** Jour et mois d'une date de naissance (l'année n'est jamais gardée). */
export function parseBirthday(value: string): { birthMonth: number; birthDay: number } | null {
  const text = value.trim();
  if (!text) return null;
  // 2024-03-14 (format international)
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (match) return checked(Number(match[3]), Number(match[2]));
  // 14/03/1985, 14-03, 14.03.85 (jour d'abord, comme en France)
  match = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-]\d{2,4})?$/.exec(text);
  if (match) return checked(Number(match[1]), Number(match[2]));
  return null;
}

function checked(day: number, month: number) {
  if (month < 1 || month > 12 || day < 1) return null;
  const max = month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day <= max ? { birthMonth: month, birthDay: day } : null;
}

/** Ligne du fichier prête à importer (avant contrôle du téléphone et de l'e-mail côté serveur). */
export type ImportRow = {
  line: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
  birthMonth: number | null;
  birthDay: number | null;
};

/** Lignes du fichier (sans la ligne des titres) mises dans les champs choisis. */
export function mapRows(rows: string[][], columns: Record<ImportField, number | null>): ImportRow[] {
  const cell = (row: string[], field: ImportField) => {
    const index = columns[field];
    return index === null ? "" : (row[index] ?? "").trim();
  };
  return rows.slice(1, IMPORT_MAX_ROWS + 1).map((row, index) => {
    let firstName = cell(row, "firstName");
    let lastName = cell(row, "lastName");
    const fullName = cell(row, "fullName");
    if (!firstName && fullName) {
      // « Camille Martin » : premier mot pour le prénom, le reste pour le nom.
      const [first, ...rest] = fullName.split(/\s+/);
      firstName = first;
      if (!lastName) lastName = rest.join(" ");
    }
    if (!firstName && lastName) {
      // Seulement un nom : il sert de prénom (champ obligatoire de la fiche).
      firstName = lastName;
      lastName = "";
    }
    const birthday = parseBirthday(cell(row, "birthday"));
    return {
      line: index + 2,
      firstName: firstName.slice(0, 80),
      lastName: lastName.slice(0, 80),
      phone: cell(row, "phone").slice(0, 40),
      email: cell(row, "email").slice(0, 200),
      notes: cell(row, "notes").slice(0, 2000),
      birthMonth: birthday?.birthMonth ?? null,
      birthDay: birthday?.birthDay ?? null,
    };
  });
}
