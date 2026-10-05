"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { signInWithLinkAction } from "@/app/(tenant)/sites/[tenantId]/mes-rendez-vous/actions";

/**
 * Lien reçu par e-mail : la connexion se fait d'un clic sur ce bouton (et non à
 * l'ouverture du lien), pour qu'un logiciel qui vérifie les liens ne l'utilise pas.
 */
export function LinkSignIn({ token }: { token: string }) {
  const t = useTranslations("site.account");
  const tErrors = useTranslations("errors");
  const [state, action, pending] = useActionState(signInWithLinkAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state && !state.ok && (
        <p role="alert" className="font-semibold text-red-700">
          {tErrors(state.error)}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-14 w-full items-center justify-center rounded-site bg-site-button px-6 text-lg font-semibold text-site-on-button disabled:opacity-50"
      >
        {t("linkButton")}
      </button>
    </form>
  );
}
