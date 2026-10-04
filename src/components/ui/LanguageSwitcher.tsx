"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/i18n/locales";

/** Sélecteur de langue. Masqué tant qu'une seule langue est activée. */
export function LanguageSwitcher() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  if (routing.locales.length < 2) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{t("common.language")}</span>
      <select
        value={locale}
        onChange={(event) => router.replace(pathname, { locale: event.target.value as Locale })}
        className="rounded-md border border-navy/20 bg-white px-2 py-1"
      >
        {routing.locales.map((code) => (
          <option key={code} value={code}>
            {t(`languages.${code}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
