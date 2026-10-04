import { getTranslations } from "next-intl/server";
import { ui } from "@/components/ui/styles";
import { env } from "@/config/env";
import { managerPage } from "@/lib/manager/page";

/** Aide : contact de l'assistance (e-mail ; WhatsApp prioritaire selon le pack) et questions fréquentes. */
export default async function HelpPage({ params }: PageProps<"/[locale]/espace/[tenantId]/plus/aide">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.help");
  const config = env();
  const email = config.SUPPORT_EMAIL ?? `support@${config.MAIN_DOMAIN}`;
  const whatsapp = page.tenant.features.whatsappSupport && config.SUPPORT_WHATSAPP;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <a
          href={`mailto:${email}?subject=${encodeURIComponent(page.tenant.name)}`}
          className={ui.secondaryButton}
        >
          {t("email")}
        </a>
        {whatsapp && (
          <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className={ui.primaryButton}>
            {t("whatsapp")}
          </a>
        )}
      </div>
      <section className={ui.card}>
        <h2 className="text-lg font-bold">{t("faq")}</h2>
        <dl className="mt-3 space-y-4">
          {(["1", "2", "3"] as const).map((n) => (
            <div key={n}>
              <dt className="font-semibold">{t(`q${n}`)}</dt>
              <dd className="text-ink/80">{t(`a${n}`)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
