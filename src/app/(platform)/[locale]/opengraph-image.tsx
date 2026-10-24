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

const COLORS = { ivory: "#faf7f2", navy: "#1b2a4a", coral: "#e8503f", night: "#16181d", body: "#3a3833" };

const fonts = Promise.all([
  readFile(join(process.cwd(), "node_modules/@fontsource/comfortaa/files/comfortaa-latin-700-normal.woff")),
  readFile(join(process.cwd(), "assets/fonts/bricolage-grotesque-latin-700.woff")),
  readFile(join(process.cwd(), "assets/fonts/outfit-latin-400.woff")),
]);

export async function generateImageMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "metadata" });
  return [{ id: "share", alt: t("title", { product: env().PRODUCT_NAME }), size, contentType }];
}

/** Horloge du logo (même dessin que src/components/brand/Logo.tsx). */
function Clock({ px }: { px: number }) {
  return (
    <svg viewBox="0 0 54 54" width={px} height={px} style={{ margin: `0 ${px * 0.06}px` }}>
      <path
        d="M40.18 42.70 A20.5 20.5 0 1 1 22.39 7.02"
        fill="none"
        stroke={COLORS.navy}
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M39.62 10.85 A20.5 20.5 0 0 1 47.49 27.72"
        fill="none"
        stroke={COLORS.coral}
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M27 27 L27 18.5 M27 27 L33.5 30.5"
        fill="none"
        stroke={COLORS.coral}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const product = env().PRODUCT_NAME;
  const [first, ...rest] = product;
  const restText = rest.join("");
  const clockIndex = restText.toLowerCase().indexOf("o");

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: COLORS.ivory,
        position: "relative",
        fontFamily: "Body",
      }}
    >
      {/* Formes décoratives, comme le bandeau final de l'accueil. */}
      <div
        style={{
          position: "absolute",
          right: -110,
          top: -110,
          width: 420,
          height: 420,
          borderRadius: 9999,
          border: `64px solid ${COLORS.coral}`,
          opacity: 0.9,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 120,
          bottom: -90,
          width: 240,
          height: 240,
          borderRadius: 9999,
          background: COLORS.navy,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          fontFamily: "Logo",
          fontSize: 76,
          color: COLORS.navy,
          letterSpacing: 2,
          WebkitTextStroke: `3px ${COLORS.navy}`,
        }}
      >
        {clockIndex === -1 ? (
          product
        ) : (
          <>
            <span>{first + restText.slice(0, clockIndex)}</span>
            <Clock px={54} />
            <span>{restText.slice(clockIndex + 1)}</span>
          </>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 820 }}>
        <div
          style={{
            fontFamily: "Display",
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.08,
            color: COLORS.night,
            letterSpacing: -2,
          }}
        >
          {t("hero.title")}
        </div>
        <div
          style={{
            fontFamily: "Display",
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.08,
            color: COLORS.coral,
            letterSpacing: -2,
          }}
        >
          {t("hero.titleAccent")}
        </div>
        <div style={{ marginTop: 28, fontSize: 30, color: COLORS.body }}>{t("hero.badge")}</div>
      </div>
    </div>,
    {
      ...size,
      fonts: await fonts.then(([logo, display, body]) => [
        { name: "Logo", data: logo, weight: 700 as const, style: "normal" as const },
        { name: "Display", data: display, weight: 700 as const, style: "normal" as const },
        { name: "Body", data: body, weight: 400 as const, style: "normal" as const },
      ]),
    },
  );
}
