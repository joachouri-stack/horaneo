import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveHostname, withPlatform, withTenant } from "@/db/access";
import { customers, services, tenants } from "@/db/schema";
import { createTenantWithData } from "../setup/fixtures";
import { hasTestDatabase, openAppDb, openTestDb, pgErrorCode, type TestDb } from "../setup/db";

/**
 * ISOLATION DES DONNÉES ENTRE TENANTS (point critique du brief).
 *
 * Deux tenants A et B sont créés avec une ligne dans chaque table. Les tests
 * passent ensuite par la connexion réelle de l'application (rôle restreint)
 * et vérifient, table par table, que A ne peut ni voir, ni modifier, ni
 * supprimer, ni créer une donnée de B.
 */

/** Droits attendus du rôle app_tenant. Toute différence fait échouer les tests. */
const EXPECTED_TENANT_GRANTS: Record<string, string[]> = {
  plans: ["SELECT"],
  platform_settings: ["SELECT"],
  legal_documents: ["SELECT"],
  tenants: ["SELECT"],
  tenant_domains: ["SELECT"],
  memberships: ["SELECT"],
  subscriptions: ["SELECT"],
  redirects: ["SELECT"],
  site_pages: ["SELECT"],
  businesses: ["SELECT"],
  business_settings: ["INSERT", "SELECT", "UPDATE"],
  usage_counters: ["INSERT", "SELECT", "UPDATE"],
  payments: ["INSERT", "SELECT", "UPDATE"],
  refunds: ["INSERT", "SELECT", "UPDATE"],
  message_log: ["INSERT", "SELECT", "UPDATE"],
  update_requests: ["INSERT", "SELECT", "UPDATE"],
  assets: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  service_categories: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  services: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  staff_members: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  staff_services: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  testimonials: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  opening_hours: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  staff_schedules: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  time_off: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  customers: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  promo_codes: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  appointments: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  appointment_items: ["DELETE", "INSERT", "SELECT", "UPDATE"],
};

describe.skipIf(!hasTestDatabase)("isolation des données entre tenants", () => {
  let owner: TestDb;
  let app: TestDb;
  let a: Awaited<ReturnType<typeof createTenantWithData>>;
  let b: Awaited<ReturnType<typeof createTenantWithData>>;
  /** Tables portant un tenant_id, lues dans le catalogue de PostgreSQL. */
  let tenantTables: string[] = [];

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
    a = await createTenantWithData(owner, "A");
    b = await createTenantWithData(owner, "B");
    const rows = await owner.execute<{ table_name: string }>(sql`
      SELECT c.table_name FROM information_schema.columns c
      JOIN information_schema.tables t USING (table_schema, table_name)
      WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND t.table_type = 'BASE TABLE'
      ORDER BY 1`);
    tenantTables = rows.map((row) => row.table_name);
  });

  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
  });

  const grantsOf = (table: string) => EXPECTED_TENANT_GRANTS[table] ?? [];

  describe("structure de la base", () => {
    it("trouve toutes les tables à protéger", () => {
      expect(tenantTables.length).toBeGreaterThanOrEqual(26);
    });

    it("active et force les règles par ligne sur chaque table portant un tenant_id, et sur tenants", async () => {
      const rows = await owner.execute<{
        relname: string;
        rls: boolean;
        forced: boolean;
        policies: string[];
      }>(sql`
        SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
               coalesce(array_agg(p.polname::text ORDER BY p.polname) FILTER (WHERE p.polname IS NOT NULL), '{}') AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        LEFT JOIN pg_policy p ON p.polrelid = c.oid
        WHERE c.relkind = 'r'
        GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity`);
      const byName = new Map(rows.map((row) => [row.relname, row]));
      for (const table of [...tenantTables, "tenants"]) {
        expect(byName.get(table), table).toMatchObject({
          rls: true,
          forced: true,
          policies: ["platform_access", "tenant_isolation"],
        });
      }
    });

    it("donne au rôle tenant exactement les droits prévus, et aucun autre", async () => {
      const rows = await owner.execute<{ table_name: string; privilege_type: string }>(sql`
        SELECT table_name, privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'app_tenant' AND table_schema = 'public'
        ORDER BY table_name, privilege_type`);
      const actual: Record<string, string[]> = {};
      for (const row of rows) (actual[row.table_name] ??= []).push(row.privilege_type);
      expect(actual).toEqual(EXPECTED_TENANT_GRANTS);
    });

    it("ne donne au rôle de connexion (Better Auth) aucun accès aux tables des tenants", async () => {
      const rows = await owner.execute<{ table_name: string }>(sql`
        SELECT DISTINCT table_name FROM information_schema.role_table_grants
        WHERE grantee = 'app_auth' AND table_schema = 'public' ORDER BY table_name`);
      expect(rows.map((row) => row.table_name)).toEqual([
        "auth_accounts",
        "auth_sessions",
        "auth_verifications",
        "users",
      ]);
    });

    it("n'accorde aucun privilège spécial aux rôles de l'application", async () => {
      const rows = await owner.execute<{
        rolname: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolinherit: boolean;
      }>(
        sql`SELECT rolname, rolsuper, rolbypassrls, rolinherit FROM pg_roles
            WHERE rolname IN ('app_tenant', 'app_platform', 'app_auth', 'app_runtime') ORDER BY rolname`,
      );
      expect(rows).toHaveLength(4);
      for (const role of rows) {
        expect(role.rolsuper, role.rolname).toBe(false);
        expect(role.rolbypassrls, role.rolname).toBe(false);
      }
      expect(rows.find((role) => role.rolname === "app_runtime")?.rolinherit).toBe(false);
    });
  });

  describe("connexion de l'application sans choix de rôle", () => {
    it("ne peut lire aucune donnée métier (seules les tables de connexion lui sont ouvertes)", async () => {
      expect(await pgErrorCode(app.select().from(customers))).toBe("42501");
      expect(await pgErrorCode(app.select().from(tenants))).toBe("42501");
    });
  });

  describe("rôle tenant sans tenant déclaré", () => {
    it("ne voit aucune ligne, dans aucune table", async () => {
      await app.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE app_tenant`);
        for (const table of [...tenantTables, "tenants"].filter(
          (t) => grantsOf(t).includes("SELECT") || t === "tenants",
        )) {
          const [{ count }] = await tx.execute<{ count: number }>(
            sql`SELECT count(*)::int AS count FROM ${sql.identifier(table)}`,
          );
          expect(count, table).toBe(0);
        }
      });
    });
  });

  describe("lecture", () => {
    it("chaque tenant ne voit que ses propres lignes, table par table", async () => {
      for (const ctx of [a, b]) {
        await withTenant(
          ctx.tenant.id,
          async (tx) => {
            for (const table of tenantTables.filter((t) => grantsOf(t).includes("SELECT"))) {
              const rows = await tx.execute<{ tenant_id: string }>(
                sql`SELECT tenant_id FROM ${sql.identifier(table)}`,
              );
              expect(rows.length, `${table} doit contenir des lignes`).toBeGreaterThan(0);
              expect(new Set(rows.map((row) => row.tenant_id)), table).toEqual(new Set([ctx.tenant.id]));
            }
          },
          app,
        );
      }
    });

    it("la table des tenants ne montre que le tenant courant", async () => {
      const rows = await withTenant(a.tenant.id, (tx) => tx.select().from(tenants), app);
      expect(rows.map((row) => row.id)).toEqual([a.tenant.id]);
    });

    it("refuse l'accès aux tables réservées à l'administratrice", async () => {
      for (const table of ["users", "orders", "stripe_events", "audit_log", "backup_runs"]) {
        const code = await pgErrorCode(
          withTenant(
            a.tenant.id,
            (tx) => tx.execute(sql`SELECT 1 FROM ${sql.identifier(table)} LIMIT 1`),
            app,
          ),
        );
        expect(code, table).toBe("42501");
      }
    });
  });

  describe("modification", () => {
    it("ne peut modifier aucune ligne d'un autre tenant", async () => {
      await withTenant(
        a.tenant.id,
        async (tx) => {
          for (const table of tenantTables.filter((t) => grantsOf(t).includes("UPDATE"))) {
            const rows = await tx.execute(
              sql`UPDATE ${sql.identifier(table)} SET tenant_id = tenant_id WHERE tenant_id = ${b.tenant.id} RETURNING 1`,
            );
            expect(rows.length, table).toBe(0);
          }
        },
        app,
      );
    });

    it("ne peut pas transférer une de ses lignes vers un autre tenant", async () => {
      for (const table of tenantTables.filter((t) => grantsOf(t).includes("UPDATE"))) {
        const code = await pgErrorCode(
          withTenant(
            a.tenant.id,
            (tx) =>
              tx.execute(
                sql`UPDATE ${sql.identifier(table)} SET tenant_id = ${b.tenant.id} WHERE tenant_id = ${a.tenant.id}`,
              ),
            app,
          ),
        );
        expect(code, table).toBe("42501");
      }
    });

    it("ne peut pas modifier la fiche du tenant (réservé à l'administratrice)", async () => {
      const code = await pgErrorCode(
        withTenant(a.tenant.id, (tx) => tx.update(tenants).set({ name: "Piraté" }), app),
      );
      expect(code).toBe("42501");
    });
  });

  describe("suppression", () => {
    it("ne peut supprimer aucune ligne d'un autre tenant", async () => {
      await withTenant(
        a.tenant.id,
        async (tx) => {
          for (const table of tenantTables.filter((t) => grantsOf(t).includes("DELETE"))) {
            const rows = await tx.execute(
              sql`DELETE FROM ${sql.identifier(table)} WHERE tenant_id = ${b.tenant.id} RETURNING 1`,
            );
            expect(rows.length, table).toBe(0);
          }
        },
        app,
      );
      // Vérification avec la connexion propriétaire : les données de B sont intactes.
      const [{ count }] = await owner.execute<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM customers WHERE tenant_id = ${b.tenant.id}`,
      );
      expect(count).toBeGreaterThan(0);
    });
  });

  describe("création", () => {
    it("refuse de créer une donnée au nom d'un autre tenant", async () => {
      const attempts = [
        (tx: Parameters<Parameters<typeof withTenant>[1]>[0]) =>
          tx.insert(customers).values({ tenantId: b.tenant.id, firstName: "Intruse", phone: "+33600000000" }),
        (tx: Parameters<Parameters<typeof withTenant>[1]>[0]) =>
          tx
            .insert(services)
            .values({ tenantId: b.tenant.id, name: { fr: "X" }, durationMinutes: 30, priceCents: 1 }),
      ];
      for (const attempt of attempts) {
        expect(await pgErrorCode(withTenant(a.tenant.id, attempt, app))).toBe("42501");
      }
    });

    it("accepte de créer une donnée pour son propre tenant", async () => {
      const [created] = await withTenant(
        a.tenant.id,
        (tx) =>
          tx
            .insert(customers)
            .values({ tenantId: a.tenant.id, firstName: "Nouvelle", phone: "+33611111111" })
            .returning(),
        app,
      );
      expect(created.tenantId).toBe(a.tenant.id);
    });
  });

  describe("rôle plateforme (espace admin)", () => {
    it("voit les données de tous les tenants", async () => {
      const rows = await withPlatform(
        (tx) =>
          tx.execute<{ tenant_id: string }>(
            sql`SELECT DISTINCT tenant_id FROM customers WHERE tenant_id IN (${a.tenant.id}, ${b.tenant.id})`,
          ),
        app,
      );
      expect(rows).toHaveLength(2);
    });

    it("ne peut toujours pas modifier le journal de l'administratrice", async () => {
      const code = await pgErrorCode(withPlatform((tx) => tx.execute(sql`DELETE FROM audit_log`), app));
      expect(code).toBe("42501");
    });
  });

  describe("étanchéité entre requêtes", () => {
    it("le tenant et le rôle ne survivent pas à la transaction", async () => {
      const single = openAppDb();
      try {
        await withTenant(a.tenant.id, async () => {}, single);
        const [state] = await single.execute<{ role: string; tenant: string | null }>(
          sql`SELECT current_user AS role, nullif(current_setting('app.tenant_id', true), '') AS tenant`,
        );
        expect(state).toEqual({ role: "app_runtime", tenant: null });
      } finally {
        await single.$client.end();
      }
    });

    it("refuse un identifiant de tenant mal formé", async () => {
      await expect(withTenant("' OR 1=1 --", async () => {}, app)).rejects.toThrow(/invalide/);
    });
  });

  describe("reconnaissance d'un domaine", () => {
    it("retrouve le tenant d'un domaine actif", async () => {
      const found = await resolveHostname(a.domain.hostname, app);
      expect(found).toMatchObject({
        tenantId: a.tenant.id,
        tenantStatus: "active",
        isPrimary: true,
        primaryHostname: a.domain.hostname,
      });
    });

    it("ignore la casse", async () => {
      expect((await resolveHostname(a.domain.hostname.toUpperCase(), app))?.tenantId).toBe(a.tenant.id);
    });

    it("ne retrouve ni un domaine inconnu ni un domaine en attente de branchement", async () => {
      await owner.execute(sql`
        INSERT INTO tenant_domains (tenant_id, hostname, type, status)
        VALUES (${a.tenant.id}, 'en-attente.example.fr', 'custom', 'pending')`);
      expect(await resolveHostname("inconnu.example.fr", app)).toBeNull();
      expect(await resolveHostname("en-attente.example.fr", app)).toBeNull();
    });

    it("indique l'adresse principale quand le domaine utilisé ne l'est pas", async () => {
      await owner.execute(sql`UPDATE tenant_domains SET is_primary = false WHERE id = ${a.domain.id}`);
      await owner.execute(sql`
        INSERT INTO tenant_domains (tenant_id, hostname, type, status, is_primary)
        VALUES (${a.tenant.id}, 'www.institut-a.example.fr', 'custom', 'active', true)`);
      expect(await resolveHostname(a.domain.hostname, app)).toMatchObject({
        isPrimary: false,
        primaryHostname: "www.institut-a.example.fr",
      });
    });
  });
});
