import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { AppHeader } from "@/components/layout/AppHeader";
import { adminQuery } from "@/lib/admin/mutation";
import { countWaitingOrders } from "@/modules/orders/orders";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Espace admin : jamais référencé ; chaque page vérifie elle-même les droits. */
export default async function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  // Pastille de l'onglet Commandes : seulement pour une administratrice déjà vérifiée.
  const waitingOrders = await adminQuery((tx) => countWaitingOrders(tx)).catch(() => 0);
  return (
    <>
      <AppHeader />
      <AdminNav badges={{ todo: waitingOrders }} />
      {children}
    </>
  );
}
