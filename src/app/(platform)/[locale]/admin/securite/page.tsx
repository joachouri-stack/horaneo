import { getTranslations, setRequestLocale } from "next-intl/server";
import QRCode from "qrcode";
import { CopyButton } from "@/components/admin/CopyButton";
import { CodeForm } from "@/components/auth/CodeForm";
import { ui } from "@/components/ui/styles";
import { env } from "@/config/env";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { requireAdminBeforeTwoFactor } from "@/lib/auth/session";
import { totpUri } from "@/lib/auth/totp";
import { beginTwoFactorSetup } from "@/lib/auth/two-factor-service";
import { confirmSetupAction } from "../actions";

/** Mise en place de la double vérification (première connexion de l'administratrice). */
export default async function AdminSecurityPage({ params }: PageProps<"/[locale]/admin/securite">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const { session, state } = await requireAdminBeforeTwoFactor(locale, "/admin/securite");
  if (state.twoFactorConfirmed) redirect({ href: "/admin", locale });

  const t = await getTranslations("admin.security");
  const secret = await beginTwoFactorSetup(session.user.id);
  const uri = totpUri(secret, session.user.email, t("issuer", { product: env().PRODUCT_NAME }));
  const qr = await QRCode.toDataURL(uri, {
    margin: 1,
    width: 240,
    color: { dark: "#1B2A4A", light: "#FFFFFF" },
  });

  return (
    <main id="contenu" className="mx-auto max-w-md px-4 py-8">
      <div className={ui.card}>
        <h1 className="text-2xl font-extrabold">{t("setupTitle")}</h1>
        <p className="mt-2">{t("setupIntro")}</p>
        <ol className="mt-6 list-decimal space-y-4 pl-5">
          <li>{t("step1")}</li>
          <li>
            {t("step2")}
            {/* QR code généré sur le serveur : la clé ne transite par aucun service externe. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={t("qrAlt")} width={240} height={240} className="mt-3 rounded-lg border" />
            {/* Sur le téléphone qui porte l'application, le QR code ne peut pas être scanné : lien direct. */}
            <a href={uri} className={`${ui.secondaryButton} mt-3`}>
              {t("openInApp")}
            </a>
            <p className="mt-3 text-sm">{t("manualKey")}</p>
            <code className="mt-1 block break-all rounded bg-ivory p-2 font-mono text-sm">
              {secret.match(/.{1,4}/g)?.join(" ")}
            </code>
            <div className="mt-2">
              <CopyButton value={secret} label={t("copyKey")} copiedLabel={t("copied")} />
            </div>
          </li>
          <li>{t("step3")}</li>
        </ol>
        <CodeForm action={confirmSetupAction} label={t("codeLabel")} submitLabel={t("confirm")} />
      </div>
    </main>
  );
}
