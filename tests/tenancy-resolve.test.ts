import { describe, expect, it, vi } from "vitest";
import type { ResolvedHostname } from "@/db/access";
import { cachedLookup, routeTenantHost } from "@/lib/tenancy/resolve";

const TENANT = "0190a0a0-0000-7000-8000-000000000001";

function domains(entries: Record<string, Partial<ResolvedHostname>>) {
  return async (hostname: string): Promise<ResolvedHostname | null> => {
    const entry = entries[hostname];
    if (!entry) return null;
    return {
      tenantId: TENANT,
      tenantStatus: "active",
      hostname,
      isPrimary: true,
      primaryHostname: hostname,
      ...entry,
    };
  };
}

const url = (path = "/") => new URL(`https://example.test${path}`);

describe("aiguillage d'un domaine client", () => {
  it("affiche le site sur son adresse principale", async () => {
    const lookup = domains({ "lea.horaneo.com": {} });
    expect(await routeTenantHost("lea.horaneo.com", url(), lookup)).toEqual({
      kind: "site",
      tenantId: TENANT,
      previewOnly: false,
    });
  });

  it("redirige le sous-domaine vers le domaine propre quand il est principal", async () => {
    const lookup = domains({
      "lea.horaneo.com": { isPrimary: false, primaryHostname: "www.institut-lea.fr" },
    });
    expect(await routeTenantHost("lea.horaneo.com", url("/soins?x=1"), lookup)).toEqual({
      kind: "redirect",
      location: "https://www.institut-lea.fr/soins?x=1",
    });
  });

  it("accepte le domaine avec ou sans www", async () => {
    const lookup = domains({ "www.institut-lea.fr": {} });
    expect(await routeTenantHost("institut-lea.fr", url("/a"), lookup)).toEqual({
      kind: "redirect",
      location: "https://www.institut-lea.fr/a",
    });
  });

  it("répond 404 pour un domaine inconnu", async () => {
    expect(await routeTenantHost("inconnu.fr", url(), domains({}))).toEqual({ kind: "not_found" });
  });

  it("répond 404 pour un site supprimé", async () => {
    const lookup = domains({ "lea.horaneo.com": { tenantStatus: "deleted" } });
    expect(await routeTenantHost("lea.horaneo.com", url(), lookup)).toEqual({ kind: "not_found" });
  });

  it("réserve un site en création à l'aperçu admin", async () => {
    const lookup = domains({ "lea.horaneo.com": { tenantStatus: "draft" } });
    expect(await routeTenantHost("lea.horaneo.com", url(), lookup)).toEqual({
      kind: "site",
      tenantId: TENANT,
      previewOnly: true,
    });
  });

  it("garde en ligne un site suspendu ou résilié (période de conservation)", async () => {
    for (const tenantStatus of ["suspended", "cancelled"] as const) {
      const lookup = domains({ "lea.horaneo.com": { tenantStatus } });
      expect((await routeTenantHost("lea.horaneo.com", url(), lookup)).kind).toBe("site");
    }
  });
});

describe("mémoire courte des domaines", () => {
  it("n'interroge la base qu'une fois pendant la durée de vie", async () => {
    const lookup = vi.fn(domains({ "lea.horaneo.com": {} }));
    const cached = cachedLookup(lookup, { ttlMs: 60_000 });
    await cached("lea.horaneo.com");
    await cached("lea.horaneo.com");
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("interroge à nouveau après expiration", async () => {
    vi.useFakeTimers();
    const lookup = vi.fn(domains({}));
    const cached = cachedLookup(lookup, { missTtlMs: 1_000 });
    await cached("x.fr");
    vi.advanceTimersByTime(1_500);
    await cached("x.fr");
    expect(lookup).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
