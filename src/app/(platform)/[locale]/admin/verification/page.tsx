import { getTranslations, setRequestLocale } from "next-intl/server";
import { CodeForm } from "@/components/auth/CodeForm";
import { ui } from "@/components/ui/styles";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { requireAdminBeforeTwoFactor } from "@/lib/auth/session";
import { verifyCodeAction } from "../actions";

/** Saisie du code de double vérification à chaque nouvelle session admin. */
export default async function AdminVerificationPage({ params }: PageProps<"/[locale]/admin/verification">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const { state } = await requireAdminBeforeTwoFactor(locale, "/admin/verification");
  if (!state.twoFactorConfirmed) redirect({ href: "/admin/securite", locale });

  const t = await getTranslations("admin.verify");
  return (
    <main id="contenu" className="mx-auto max-w-md px-4 py-8">
      <div className={ui.card}>
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <p className="mt-2">{t("intro")}</p>
        <CodeForm
          action={verifyCodeAction}
          label={t("codeLabel")}
          submitLabel={t("submit")}
          allowBackupCode
        />
      </div>
    </main>
  );
}
