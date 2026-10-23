"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";

type Props = {
  /** Page ouverte après la déconnexion (accueil par défaut). */
  to?: string;
  label?: string;
  className?: string;
};

export function SignOutButton({ to = "/", label, className }: Props = {}) {
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.replace(to);
        router.refresh();
      }}
      className={
        className ??
        "inline-flex min-h-11 items-center text-sm font-semibold text-night hover:underline disabled:opacity-60 min-[400px]:text-base"
      }
    >
      {label ?? t("logout")}
    </button>
  );
}
