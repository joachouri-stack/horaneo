import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { AppHeader } from "@/components/layout/AppHeader";
import { adminQuery } from "@/lib/admin/mutation";
import { countWaitingOrders } from "@/modules/orders/orders";
import { countNewRequests } from "@/modules/requests/update-requests";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Espace admin : jamais référencé ; chaque page vérifie elle-même les droits. */
export default async function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  // Pastille « À traiter » (commandes et demandes de modification) : seulement pour une
  // administratrice déjà vérifiée.
  const waiting = await adminQuery(
    async (tx) => (await countWaitingOrders(tx)) + (await countNewRequests(tx)),
  ).catch(() => 0);
  return (
    <>
      <AppHeader />
      <AdminNav badges={{ todo: waiting }} />
      {children}
    </>
  );
}
