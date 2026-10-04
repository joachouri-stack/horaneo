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
  footer: string;
};

/**
 * Mise en page simple d'un e-mail du SaaS avec un bouton d'action.
 * Les e-mails envoyés au nom d'un établissement auront leur propre mise en page (étape 9).
 */
export function renderActionEmail({ locale, brandName, title, paragraphs, action, footer }: ActionEmail) {
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
        <tr><td style="font-size:13px;color:#6b6b6b;line-height:1.5">${escapeHtml(footer)}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const text = [title, "", ...paragraphs, "", `${action.label} : ${action.url}`, "", footer].join("\n");
  return { html, text };
}
