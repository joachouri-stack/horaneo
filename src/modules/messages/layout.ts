import { ensureContrast, HEX_COLOR } from "@/lib/colors";
import { escapeHtml } from "@/lib/email/layout";

/**
 * Mise en page des e-mails. Ceux envoyés aux clientes portent le nom et la
 * couleur de l'établissement ; ceux envoyés aux gérantes, la couleur du SaaS.
 */

export type EmailContent = {
  locale: string;
  brandName: string;
  /** Logo de l'établissement (adresse complète), affiché à la place du nom en tête d'e-mail. */
  logoUrl?: string | null;
  /** Couleur principale (titres, bouton). Rendue assez foncée pour rester lisible. */
  color?: string | null;
  title: string;
  paragraphs: string[];
  /** Valeur mise en avant sous les paragraphes (ex. un code promo personnel). */
  highlight?: string;
  details?: { label: string; value: string }[];
  list?: string[];
  action?: { label: string; url: string } | null;
  /** Liens secondaires, sous le bouton (ex. « Ajouter à mon agenda »). */
  links?: { label: string; url: string }[];
  after?: string[];
  footer: string[];
};

const DEFAULT_COLOR = "#1B2A4A";

export function renderEmail(content: EmailContent) {
  const color = ensureContrast(
    content.color && HEX_COLOR.test(content.color) ? content.color : DEFAULT_COLOR,
    "#ffffff",
    4.5,
    "#000000",
  );
  const row = (html: string, style = "font-size:16px;line-height:1.5;padding-bottom:12px") =>
    `<tr><td style="${style}">${html}</td></tr>`;
  const details = content.details?.length
    ? row(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f0;border-radius:10px;padding:12px 16px">${content.details
          .map(
            (item) =>
              `<tr><td style="font-size:14px;color:#6b6b6b;padding:4px 12px 4px 0;vertical-align:top;white-space:nowrap">${escapeHtml(item.label)}</td><td style="font-size:16px;padding:4px 0;font-weight:bold">${escapeHtml(item.value)}</td></tr>`,
          )
          .join("")}</table>`,
        "padding:4px 0 16px",
      )
    : "";
  const highlight = content.highlight
    ? row(
        `<div style="border:2px dashed ${color};border-radius:10px;padding:16px;text-align:center;font-family:'Courier New',Courier,monospace;font-size:26px;font-weight:bold;letter-spacing:3px;color:${color}">${escapeHtml(content.highlight)}</div>`,
        "padding:4px 0 16px",
      )
    : "";
  const list = content.list?.length
    ? row(
        `<ul style="margin:0;padding-left:20px">${content.list.map((item) => `<li style="padding:3px 0">${escapeHtml(item)}</li>`).join("")}</ul>`,
      )
    : "";
  const action = content.action
    ? row(
        `<a href="${escapeHtml(content.action.url)}" style="display:inline-block;background:${color};color:#ffffff;font-weight:bold;font-size:17px;text-decoration:none;padding:14px 24px;border-radius:10px">${escapeHtml(content.action.label)}</a>`,
        "padding:8px 0 20px",
      )
    : "";

  const links = content.links?.length
    ? row(
        content.links
          .map(
            (link) =>
              `<a href="${escapeHtml(link.url)}" style="color:${color};font-weight:bold;text-decoration:underline">${escapeHtml(link.label)}</a>`,
          )
          .join(" &nbsp;·&nbsp; "),
        "font-size:15px;padding:0 0 20px",
      )
    : "";

  const html = `<!doctype html>
<html lang="${escapeHtml(content.locale)}">
<body style="margin:0;background:#FAF7F2;font-family:Arial,Helvetica,sans-serif;color:#2B2B2B">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px">
        ${
          content.logoUrl
            ? row(
                `<img src="${escapeHtml(content.logoUrl)}" alt="${escapeHtml(content.brandName)}" height="64" style="display:block;height:64px;width:auto;max-width:240px;border:0">`,
                "padding-bottom:24px",
              )
            : row(
                escapeHtml(content.brandName),
                `font-size:22px;font-weight:bold;color:${color};padding-bottom:24px`,
              )
        }
        ${row(escapeHtml(content.title), "font-size:20px;font-weight:bold;color:#2B2B2B;padding-bottom:16px")}
        ${content.paragraphs.map((text) => row(escapeHtml(text))).join("\n        ")}
        ${highlight}
        ${details}
        ${list}
        ${action}
        ${links}
        ${(content.after ?? []).map((text) => row(escapeHtml(text), "font-size:15px;line-height:1.5;padding-bottom:10px;color:#444")).join("\n        ")}
        ${row(content.footer.map(escapeHtml).join("<br>"), "font-size:13px;color:#6b6b6b;line-height:1.5;padding-top:16px;border-top:1px solid #eee")}
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    content.title,
    "",
    ...content.paragraphs,
    ...(content.highlight ? ["", content.highlight] : []),
    ...(content.details?.length
      ? ["", ...content.details.map((item) => `${item.label} : ${item.value}`)]
      : []),
    ...(content.list?.length ? ["", ...content.list.map((item) => `- ${item}`)] : []),
    ...(content.action ? ["", `${content.action.label} : ${content.action.url}`] : []),
    ...(content.links ?? []).map((link) => `${link.label} : ${link.url}`),
    ...(content.after?.length ? ["", ...content.after] : []),
    "",
    "--",
    ...content.footer,
  ].join("\n");
  return { html, text };
}
