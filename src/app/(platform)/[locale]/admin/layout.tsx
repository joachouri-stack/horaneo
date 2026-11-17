import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { resolveLocale } from "@/i18n/translator";
import { AppHeader } from "@/components/layout/AppHeader";
import { adminQuery } from "@/lib/admin/mutation";
import { countWaitingOrders } from "@/modules/orders/orders";
import { countNewRequests } from "@/modules/requests/update-requests";

export async function generateMetadata({ params }: LayoutProps<"/[locale]/admin">): Promise<Metadata> {
  const t = await getTranslations({ locale: resolveLocale((await params).locale), namespace: "admin" });
  // Titre de l'onglet de toutes les pages de l'admin : « Administration · Sirine ».
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/** Espace admin : jamais référencé ; chaque page vérifie elle-même les droits. */
export default async function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  // Pastille « À traiter » (commandes et demandes de modification) : seulement pour une
  // administratrice déjà vérifiée.
  const waiting = await adminQuery(
    async (tx) => (await countWaitingOrders(tx)) + (await countNewRequests(tx)),
  ).catch(() => 0);
  return (
    // Tous les textes (le site commercial n'envoie que les siens).
    <NextIntlClientProvider messages={await getMessages()}>
      <AppHeader />
      <AdminNav badges={{ todo: waiting }} />
      {children}
    </NextIntlClientProvider>
  );
}
