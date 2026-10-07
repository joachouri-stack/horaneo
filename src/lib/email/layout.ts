/** Échappe un texte pour l'insérer dans du HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type ActionEmail = {
  locale: string;
  brandName: string;
  title: string;
  paragraphs: string[];
  action: { label: string; url: string };
  /** Code à recopier, sous le bouton (connexion depuis un autre appareil). */
  code?: { label: string; value: string };
  footer: string;
};

/**
 * Mise en page simple d'un e-mail du SaaS avec un bouton d'action.
 * Les e-mails envoyés au nom d'un établissement utilisent `src/modules/messages/layout.ts`.
 */
export function renderActionEmail({
  locale,
  brandName,
  title,
  paragraphs,
  action,
  code,
  footer,
}: ActionEmail) {
  const html = `<!doctype html>
<html lang="${escapeHtml(locale)}">
<body style="margin:0;background:#FAF7F2;font-family:Arial,Helvetica,sans-serif;color:#2B2B2B">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
        <tr><td style="font-size:22px;font-weight:bold;color:#1B2A4A;padding-bottom:24px">${escapeHtml(brandName)}</td></tr>
        <tr><td style="font-size:20px;font-weight:bold;color:#1B2A4A;padding-bottom:16px">${escapeHtml(title)}</td></tr>
        ${paragraphs.map((p) => `<tr><td style="font-size:16px;line-height:1.5;padding-bottom:12px">${escapeHtml(p)}</td></tr>`).join("\n        ")}
        <tr><td style="padding:16px 0 24px">
          <a href="${escapeHtml(action.url)}" style="display:inline-block;background:#E8503F;color:#ffffff;font-weight:bold;font-size:18px;text-decoration:none;padding:14px 24px;border-radius:10px">${escapeHtml(action.label)}</a>
        </td></tr>
        ${
          code
            ? `<tr><td style="font-size:15px;line-height:1.5;padding-bottom:8px">${escapeHtml(code.label)}</td></tr>
        <tr><td style="padding-bottom:24px"><span style="display:inline-block;background:#FAF7F2;border-radius:10px;padding:12px 20px;font-size:30px;font-weight:bold;letter-spacing:8px;color:#1B2A4A;font-family:'Courier New',monospace">${escapeHtml(code.value)}</span></td></tr>`
            : ""
        }
        <tr><td style="font-size:13px;color:#6b6b6b;line-height:1.5">${escapeHtml(footer)}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const text = [
    title,
    "",
    ...paragraphs,
    "",
    `${action.label} : ${action.url}`,
    ...(code ? ["", `${code.label} ${code.value}`] : []),
    "",
    footer,
  ].join("\n");
  return { html, text };
}
