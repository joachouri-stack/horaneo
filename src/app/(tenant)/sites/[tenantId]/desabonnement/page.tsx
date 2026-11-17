import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/site/blocks";
import { getSite } from "@/lib/site/load";
import { readUnsubscribeToken } from "@/modules/customers/unsubscribe";
import { unsubscribeAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("site.unsubscribe");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * Lien « Ne plus recevoir nos offres » des e-mails de relance : le client confirme
 * d'un bouton (un simple passage sur le lien, par un logiciel de messagerie, ne
 * retire rien). Les messages liés à ses rendez-vous continuent.
 */
export default async function UnsubscribePage({
  params,
  searchParams,
}: PageProps<"/sites/[tenantId]/desabonnement">) {
  const site = await getSite((await params).tenantId);
  const query = await searchParams;
  const t = await getTranslations("site.unsubscribe");
  const token = typeof query.t === "string" ? query.t : "";
  const state = query.fait ? "done" : query.erreur || !readUnsubscribeToken(token) ? "invalid" : "confirm";
  return (
    <main id="contenu" className="mx-auto max-w-xl px-4 py-12">
      <PageTitle title={t("title")} />
      <div className="space-y-5 text-site-text">
        {state === "done" && <p role="status">{t("done", { name: site.tenant.name })}</p>}
        {state === "invalid" && <p role="alert">{t("invalid", { name: site.tenant.name })}</p>}
        {state === "confirm" && (
          <form action={unsubscribeAction} className="space-y-5">
            <input type="hidden" name="t" value={token} />
            <p>{t("intro", { name: site.tenant.name })}</p>
            <button
              type="submit"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-site-button px-5 font-semibold text-site-on-button"
            >
              {t("confirm")}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
