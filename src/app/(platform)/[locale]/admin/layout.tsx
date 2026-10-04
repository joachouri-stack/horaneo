import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { AppHeader } from "@/components/layout/AppHeader";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Espace admin : jamais référencé ; chaque page vérifie elle-même les droits. */
export default function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  return (
    <>
      <AppHeader />
      <AdminNav />
      {children}
    </>
  );
}
