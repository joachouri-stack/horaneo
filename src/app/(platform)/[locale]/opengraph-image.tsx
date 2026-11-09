import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { env } from "@/config/env";
import { resolveLocale } from "@/i18n/translator";

/**
 * Image d'aperçu quand on partage un lien du site commercial (WhatsApp,
 * Facebook, LinkedIn…) : logo, accroche et promesse, aux couleurs du SaaS.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLORS = {
  night: "#0b1033",
  violet: "#7b3fe4",
  azure: "#2f80ff",
  white: "#ffffff",
  soft: "#c7cbe6",
};

const fonts = Promise.all([
  readFile(join(process.cwd(), "assets/fonts/bricolage-grotesque-latin-700.woff")),
  readFile(join(process.cwd(), "assets/fonts/outfit-latin-400.woff")),
]);

export async function generateImageMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "metadata" });
  return [{ id: "share", alt: t("title", { product: env().PRODUCT_NAME }), size, contentType }];
}

/** Logo officiel détouré (lettres blanches), en PNG : lisible par le générateur d'images. */
const logo = readFile(join(process.cwd(), "assets/brand-logo-on-dark.png")).then(
  (data) => `data:image/png;base64,${data.toString("base64")}`,
);

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const product = env().PRODUCT_NAME;
  const logoSrc = await logo;
  const gradient = `linear-gradient(120deg, ${COLORS.violet}, ${COLORS.azure})`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: COLORS.night,
        position: "relative",
        fontFamily: "Body",
      }}
    >
      {/* Arcs lumineux, comme sur le logo. */}
      <div
        style={{
          position: "absolute",
          left: -260,
          top: -380,
          width: 760,
          height: 760,
          borderRadius: 9999,
          border: `3px solid ${COLORS.violet}`,
          opacity: 0.8,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -300,
          bottom: -420,
          width: 820,
          height: 820,
          borderRadius: 9999,
          border: `3px solid ${COLORS.azure}`,
          opacity: 0.8,
        }}
      />
      <img src={logoSrc} alt={product} width={350} height={120} />
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
        <div
          style={{
            fontFamily: "Display",
            fontSize: 70,
            lineHeight: 1.08,
            color: COLORS.white,
            letterSpacing: -2,
          }}
        >
          {t("hero.title")}
        </div>
        <div
          style={{
            fontFamily: "Display",
            fontSize: 70,
            lineHeight: 1.08,
            letterSpacing: -2,
            backgroundImage: gradient,
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {t("hero.titleAccent")}
        </div>
        <div style={{ marginTop: 28, fontSize: 30, color: COLORS.soft }}>{t("hero.badge")}</div>
      </div>
    </div>,
    {
      ...size,
      fonts: await fonts.then(([display, body]) => [
        { name: "Display", data: display, weight: 700 as const, style: "normal" as const },
        { name: "Body", data: body, weight: 400 as const, style: "normal" as const },
      ]),
    },
  );
}
