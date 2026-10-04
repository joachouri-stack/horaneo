"use client";

import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Connexion côté navigateur (boutons Google/Apple, envoi du lien magique, déconnexion). */
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
