import { getTranslations } from "next-intl/server";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { dataExportAllowed } from "@/modules/export/business-data";

/** Export des données : la gérante récupère ses tableaux (avant de résilier ou à tout moment). */
export default async function ExportPage({ params }: PageProps<"/[locale]/espace/[tenantId]/plus/exporter">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.export");
  const allowed = await page.db((tx) => dataExportAllowed(tx, page.tenantId, page.tenant.features));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
          {t("title")}
        </h1>
        <p className="mt-1 text-ink/70">{t("subtitle")}</p>
      </div>
      {!allowed ? (
        <section className={`${ui.card} space-y-4`}>
          <p className="text-ink/80">{t("locked")}</p>
          <Link href={`${page.base}/plus/abonnement`} className={`${ui.primaryButton} sm:w-auto`}>
            {t("lockedLink")}
          </Link>
        </section>
      ) : (
        <section className={`${ui.card} space-y-4`}>
          <p className="text-ink/80">{t("intro")}</p>
          <ul className="list-disc space-y-1 pl-5 text-ink/80">
            {(t.raw("contents") as string[]).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {/* Lien simple (pas de préchargement) : le fichier est préparé au moment du clic. */}
          <a
            href={`/${page.locale}${page.base}/plus/exporter/telecharger`}
            download
            className={`${ui.primaryButton} sm:w-auto`}
          >
            {t("download")}
          </a>
          <p className="text-sm text-ink/70">{t("note")}</p>
        </section>
      )}
    </div>
  );
}
