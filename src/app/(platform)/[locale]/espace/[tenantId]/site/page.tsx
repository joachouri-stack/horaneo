import { getTranslations } from "next-intl/server";
import { LogoUpload } from "@/components/manager/LogoUpload";
import { ui } from "@/components/ui/styles";
import { assets, tenantDomains } from "@/db/schema";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { storage } from "@/lib/storage";
import { tenantSiteUrl } from "@/lib/tenancy/urls";
import { and, eq } from "drizzle-orm";
import { uploadLogoAction } from "../actions";

/** « Mon site » : ce que la gérante modifie elle-même (dont le logo), et le reste par demande. */
export default async function MySitePage({ params }: PageProps<"/[locale]/espace/[tenantId]/site">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.site");
  const [primary] = await page.db((tx) =>
    tx
      .select({ hostname: tenantDomains.hostname })
      .from(tenantDomains)
      .where(and(eq(tenantDomains.tenantId, page.tenantId), eq(tenantDomains.isPrimary, true))),
  );
  const logoId = page.tenant.brand.logoAssetId;
  const [logo] = logoId
    ? await page.db((tx) =>
        tx.select({ storageKey: assets.storageKey }).from(assets).where(eq(assets.id, logoId)),
      )
    : [];
  const links = [
    { href: "/site/prestations", label: t("services") },
    { href: "/site/horaires", label: t("hours") },
    { href: "/site/photos", label: t("photos") },
    { href: "/site/textes", label: t("texts.link") },
    { href: "/site/couleurs", label: t("colors.link") },
    ...(page.tenant.features.testimonials ? [{ href: "/site/temoignages", label: t("testimonials") }] : []),
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
          {t("title")}
        </h1>
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
      {/* Logo commun à tout le site : changé depuis l'établissement principal. */}
      <section className={ui.card}>
        <h2 className="text-lg font-semibold">{t("logo.title")}</h2>
        {page.business.isPrimary ? (
          <LogoUpload
            tenantId={page.tenantId}
            logoUrl={logo ? storage().publicUrl(logo.storageKey) : null}
            action={uploadLogoAction}
          />
        ) : (
          <p className="mt-1 text-ink/70">{t("sharedContent")}</p>
        )}
      </section>
      <section className={ui.card}>
        <h2 className="text-lg font-semibold">{t("requestTitle")}</h2>
        <p className="mt-1 text-ink/70">{t("requestText")}</p>
        <Link href={`${page.base}/plus/demandes`} className={`mt-4 ${ui.primaryButton} sm:w-auto`}>
          {t("requestCta")}
        </Link>
      </section>
    </div>
  );
}
