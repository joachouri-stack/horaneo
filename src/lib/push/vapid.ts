import { createECDH, hkdfSync } from "node:crypto";

/**
 * Clés « VAPID » des notifications : elles prouvent aux services de
 * notifications (Apple, Google, Mozilla) que les envois viennent bien de nous.
 *
 * Elles sont recalculées à partir du secret du serveur (comme les liens de
 * connexion) : rien à configurer, et elles restent les mêmes d'un démarrage à
 * l'autre. Changer le secret oblige chaque gérante à réactiver ses notifications.
 */
export function vapidKeysFrom(secret: string) {
  for (let round = 0; round < 16; round += 1) {
    const candidate = Buffer.from(hkdfSync("sha256", secret, "web-push-vapid", `v1:${round}`, 32));
    try {
      const ecdh = createECDH("prime256v1");
      // Refusé (rarissime) si le nombre tiré n'est pas une clé valide : on en tire un autre.
      ecdh.setPrivateKey(candidate);
      return {
        publicKey: ecdh.getPublicKey().toString("base64url"),
        privateKey: candidate.toString("base64url"),
      };
    } catch {
      continue;
    }
  }
  throw new Error("Impossible de calculer les clés des notifications.");
}
