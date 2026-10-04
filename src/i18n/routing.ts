import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE } from "./locales";
import { ENABLED_LOCALES } from "./enabled";

/** Adresses du site commercial : horaneo.com/fr, /en, /es, /ru. */
export const routing = defineRouting({
  locales: ENABLED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
});
