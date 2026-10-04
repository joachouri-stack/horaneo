import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { Section } from "@/components/admin/fields";
import { LogoColorsForm } from "@/components/admin/LogoColorsForm";
import { WizardNav } from "@/components/admin/WizardNav";
import { assets } from "@/db/schema";
import { adminQuery } from "@/lib/admin/mutation";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { storage } from "@/lib/storage";

export default async function LogoPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/clients/[tenantId]/logo">) {
  const { tenantId } = await params;
  const assistant = (await searchParams).assistant === "1";
  const [t, { tenant }] = await Promise.all([
    getTranslations("admin.tenant.logo"),
    loadTenantOverview(tenantId),
  ]);
  const logoId = tenant.brand.logoAssetId;
  const [logo] = logoId
    ? await adminQuery((tx) => tx.select().from(assets).where(eq(assets.id, logoId)))
    : [];

  return (
    <>
      <WizardNav tenantId={tenantId} current="logo" active={assistant} />
      <Section title={t("title")}>
        <LogoColorsForm
          tenantId={tenantId}
          logoUrl={logo ? storage().publicUrl(logo.storageKey) : null}
          primary={tenant.brand.colors?.primary ?? "#1f1f1f"}
          secondary={tenant.brand.colors?.secondary ?? "#f5f1ea"}
          appearance={{
            businessCategory: tenant.businessCategory ?? "",
            templateKey: tenant.templateKey,
            theme: tenant.theme,
          }}
        />
      </Section>
    </>
  );
}
