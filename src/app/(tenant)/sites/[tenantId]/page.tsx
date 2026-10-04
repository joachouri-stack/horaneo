import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getTenant } from "@/lib/tenancy/current-tenant";

/** Accueil provisoire d'un site client (le modèle complet arrive à l'étape 5). */
export default async function TenantHomePage({ params }: PageProps<"/sites/[tenantId]">) {
  const { tenantId } = await params;
  const tenant = await getTenant(tenantId);
  if (!tenant) notFound();
  const t = await getTranslations("site");

  if (tenant.status === "suspended") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-3xl font-bold">{tenant.name}</h1>
        <p className="mt-4">{t("suspended")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="text-4xl font-bold">{tenant.name}</h1>
      {tenant.city && <p className="mt-2 text-neutral-600">{tenant.city}</p>}
      {tenant.phone && (
        <p className="mt-8">
          <a href={`tel:${tenant.phone}`} className="font-semibold underline">
            {tenant.phone}
          </a>
        </p>
      )}
    </main>
  );
}
