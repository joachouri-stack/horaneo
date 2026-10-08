import { getTranslations } from "next-intl/server";
import { ui } from "@/components/ui/styles";
import { tenantDomains } from "@/db/schema";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { tenantSiteUrl } from "@/lib/tenancy/urls";
import { and, eq } from "drizzle-orm";

/** « Mon site » : ce que la gérante modifie elle-même, et le reste par demande. */
export default async function MySitePage({ params }: PageProps<"/[locale]/espace/[tenantId]/site">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.site");
  const [primary] = await page.db((tx) =>
    tx
      .select({ hostname: tenantDomains.hostname })
      .from(tenantDomains)
      .where(and(eq(tenantDomains.tenantId, page.tenantId), eq(tenantDomains.isPrimary, true))),
  );
  const links = [
    { href: "/site/prestations", label: t("services") },
    { href: "/site/horaires", label: t("hours") },
    { href: "/site/photos", label: t("photos") },
    ...(page.tenant.features.testimonials ? [{ href: "/site/temoignages", label: t("testimonials") }] : []),
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <p className="mt-1 text-ink/70">{t("intro")}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={`${page.base}${link.href}`} className={`${ui.secondaryButton} justify-between`}>
              {link.label} <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
      {primary && page.tenant.status === "active" && (
        <a
          href={tenantSiteUrl(primary.hostname)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center font-semibold text-night underline"
        >
          {t("view")} ↗
        </a>
      )}
      <section className={ui.card}>
        <h2 className="text-lg font-bold">{t("requestTitle")}</h2>
        <p className="mt-1 text-ink/70">{t("requestText")}</p>
        <Link href={`${page.base}/plus/demandes`} className={`mt-4 ${ui.primaryButton} sm:w-auto`}>
          {t("requestCta")}
        </Link>
      </section>
    </div>
  );
}
