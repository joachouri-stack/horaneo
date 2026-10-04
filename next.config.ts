import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { parseEnabledLocales } from "./src/i18n/enabled";

// Langues activées : chaque langue doit avoir son fichier de traduction.
const enabledLocales = parseEnabledLocales(process.env.ENABLED_LOCALES);
for (const locale of enabledLocales) {
  const file = path.join(process.cwd(), "messages", `${locale}.json`);
  if (!existsSync(file)) {
    throw new Error(`ENABLED_LOCALES contient "${locale}" mais ${file} n'existe pas.`);
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Photos des clients : stockage local (/media) ou domaine public R2 ; visuels du site commercial (/marketing).
    localPatterns: [
      { pathname: "/media/**", search: "" },
      { pathname: "/marketing/**", search: "" },
    ],
    remotePatterns: process.env.R2_PUBLIC_URL
      ? [new URL(`${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/**`)]
      : [],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    // Envoi de photos jusqu'à 10 Mo (plus la marge du formulaire).
    serverActions: { bodySizeLimit: "12mb" },
  },
  env: {
    NEXT_PUBLIC_ENABLED_LOCALES: enabledLocales.join(","),
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
