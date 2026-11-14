import { SignOutButton } from "@/components/auth/SignOutButton";
import { PlatformHeader } from "./PlatformHeader";

/** En-tête des espaces connectés (gérante, admin) : logo et déconnexion. */
export function AppHeader() {
  return (
    <PlatformHeader>
      {/* Bandeau bleu nuit : texte clair, lisible. */}
      <SignOutButton className="inline-flex min-h-11 items-center text-sm font-semibold text-white/85 transition-colors hover:text-white hover:underline disabled:opacity-60 min-[400px]:text-base" />
    </PlatformHeader>
  );
}
