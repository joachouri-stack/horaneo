"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { suggestEmail } from "@/lib/auth/email-typos";

/**
 * Entoure un champ « email » existant : propose la bonne adresse en cas de faute de
 * frappe probable (« gmial.com »), corrigée d'un toucher. Le champ reste celui du formulaire.
 */
export function EmailSuggestion({ children }: { children: ReactNode }) {
  const t = useTranslations("auth");
  const box = useRef<HTMLDivElement>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const input = () => box.current?.querySelector<HTMLInputElement>('input[name="email"]') ?? null;
  return (
    <div
      ref={box}
      onInput={(event) => {
        const target = event.target as HTMLInputElement;
        if (target.name === "email") setSuggestion(suggestEmail(target.value.trim()));
      }}
    >
      {children}
      {suggestion && (
        <p aria-live="polite" className="mt-2 text-sm text-ink/80">
          {t.rich("didYouMean", {
            email: suggestion,
            fix: (chunks) => (
              <button
                type="button"
                onClick={() => {
                  const field = input();
                  if (field) {
                    field.value = suggestion;
                    field.focus();
                  }
                  setSuggestion(null);
                }}
                className="inline-flex min-h-11 items-center font-semibold text-night underline"
              >
                {chunks}
              </button>
            ),
          })}
        </p>
      )}
    </div>
  );
}
