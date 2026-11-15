/**
 * Fautes de frappe courantes dans l'adresse e-mail (« gmial.com », « hotmail.con ») :
 * on propose la bonne adresse avant d'envoyer un lien qui n'arriverait jamais.
 */

/** Messageries les plus courantes, auxquelles on compare le domaine saisi. */
const KNOWN_DOMAINS = [
  "gmail.com",
  "hotmail.fr",
  "hotmail.com",
  "outlook.fr",
  "outlook.com",
  "live.fr",
  "live.com",
  "msn.com",
  "yahoo.fr",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "sfr.fr",
  "neuf.fr",
  "bbox.fr",
  "laposte.net",
];

/** Distance d'édition (insertions, suppressions, remplacements, inversions de deux lettres voisines). */
function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

/**
 * Adresse corrigée si le domaine ressemble de près à une messagerie courante sans
 * l'être exactement (« marie@gmial.com » → « marie@gmail.com ») ; sinon null.
 */
export function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain || KNOWN_DOMAINS.includes(domain)) return null;
  let best: { domain: string; score: number } | null = null;
  for (const known of KNOWN_DOMAINS) {
    const score = distance(domain, known);
    // Domaines courts (« me.com », « sfr.fr ») : une seule lettre d'écart, sinon trop de fausses alertes.
    const allowed = known.length < 8 ? 1 : 2;
    if (score <= allowed && (!best || score < best.score)) best = { domain: known, score };
  }
  return best ? `${local}@${best.domain}` : null;
}
