import { createECDH } from "node:crypto";
import { describe, expect, it } from "vitest";
import { vapidKeysFrom } from "@/lib/push/vapid";
import { deviceInput } from "@/modules/notifications/devices";

describe("clés des notifications (VAPID)", () => {
  it("toujours les mêmes pour un même secret, différentes pour un autre", () => {
    const a = vapidKeysFrom("secret-de-test-0000000000000000000000000");
    expect(vapidKeysFrom("secret-de-test-0000000000000000000000000")).toEqual(a);
    expect(vapidKeysFrom("autre-secret-00000000000000000000000000").publicKey).not.toBe(a.publicKey);
  });

  it("une vraie paire de clés P-256 : la clé publique correspond à la clé privée", () => {
    const keys = vapidKeysFrom("secret-de-test-0000000000000000000000000");
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(keys.privateKey, "base64url"));
    expect(ecdh.getPublicKey().toString("base64url")).toBe(keys.publicKey);
    expect(Buffer.from(keys.publicKey, "base64url")).toHaveLength(65);
    expect(Buffer.from(keys.privateKey, "base64url")).toHaveLength(32);
  });
});

describe("appareil à abonner", () => {
  const valid = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: {
      p256dh: Buffer.alloc(65, 4).toString("base64url"),
      auth: Buffer.alloc(16, 1).toString("base64url"),
    },
  };

  it("accepte un abonnement de navigateur bien formé", () => {
    expect(deviceInput.safeParse(valid).success).toBe(true);
  });

  it("refuse une adresse non https ou des clés de mauvaise longueur", () => {
    expect(deviceInput.safeParse({ ...valid, endpoint: "http://exemple.fr/x" }).success).toBe(false);
    expect(deviceInput.safeParse({ ...valid, keys: { ...valid.keys, p256dh: "BTest" } }).success).toBe(false);
    expect(deviceInput.safeParse({ ...valid, keys: { ...valid.keys, auth: "aTest" } }).success).toBe(false);
  });
});
