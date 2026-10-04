import { getTranslations, setRequestLocale } from "next-intl/server";
import { CreateTenantForm } from "@/components/admin/CreateTenantForm";
import { ui } from "@/components/ui/styles";
import { env } from "@/config/env";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { requireAdmin } from "@/lib/auth/session";
import { listPlans } from "@/modules/tenants/queries";

/** Nouveau client : étape 1 du formulaire par étapes. */
export default async function NewClientPage({ params }: PageProps<"/[locale]/admin/clients/nouveau">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, plans] = await Promise.all([getTranslations("admin.create"), adminQuery((tx) => listPlans(tx))]);

  return (
    <main id="contenu" className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-extrabold">{t("title")}</h1>
        <p className="mt-2 text-ink/80">{t("intro")}</p>
      </div>
      <div className={ui.card}>
        <CreateTenantForm
          plans={plans.map((plan) => ({ value: plan.code, label: pickLocalized(plan.name, locale) }))}
          mainDomain={env().MAIN_DOMAIN}
        />
      </div>
    </main>
  );
}
