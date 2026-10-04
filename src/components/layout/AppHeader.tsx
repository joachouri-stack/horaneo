import { SignOutButton } from "@/components/auth/SignOutButton";
import { PlatformHeader } from "./PlatformHeader";

/** En-tête des espaces connectés (gérante, admin) : logo et déconnexion. */
export function AppHeader() {
  return (
    <PlatformHeader>
      <SignOutButton />
    </PlatformHeader>
  );
}
