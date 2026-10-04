import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appointmentItems,
  appointments,
  auditLog,
  customers,
  plans,
  services,
  staffMembers,
  tenants,
  usageCounters,
  users,
  businesses,
} from "@/db/schema";
import { hasTestDatabase, openTestDb, pgErrorCode, type TestDb } from "../setup/db";

/**
 * Garde-fous inscrits directement dans la base de données.
 * Ils protègent les données même si le code de l'application a une erreur.
 */
describe.skipIf(!hasTestDatabase)("garde-fous de la base de données", () => {
  let db: TestDb;
  let planId: string;

  beforeAll(async () => {
    db = await openTestDb();
    const [basic] = await db.select().from(plans).where(eq(plans.code, "basic"));
    planId = basic.id;
  });

  afterAll(async () => {
    await db?.$client.end();
  });

  let counter = 0;
  async function createTenant() {
    counter += 1;
    const [tenant] = await db
      .insert(tenants)
      .values({ slug: `test-${counter}-${Date.now()}`, name: `Institut ${counter}`, planId })
      .returning();
    // Une seule entreprise : business_id est rempli automatiquement.
    await db.insert(businesses).values({ tenantId: tenant.id, name: tenant.name, isPrimary: true });
    const [staff] = await db.insert(staffMembers).values({ tenantId: tenant.id, name: "Léa" }).returning();
    const [customer] = await db
      .insert(customers)
      .values({ tenantId: tenant.id, firstName: "Camille", email: `camille${counter}@example.com` })
      .returning();
    return { tenant, staff, customer };
  }

  function appointment(
    ctx: Awaited<ReturnType<typeof createTenant>>,
    start: string,
    end: string,
    overrides: Partial<typeof appointments.$inferInsert> = {},
  ) {
    return db
      .insert(appointments)
      .values({
        tenantId: ctx.tenant.id,
        customerId: ctx.customer.id,
        staffId: ctx.staff.id,
        startsAt: new Date(start),
        endsAt: new Date(end),
        blockedUntil: new Date(end),
        status: "confirmed",
        source: "online",
        totalCents: 5000,
        ...overrides,
      })
      .returning();
  }

  describe("identifiants", () => {
    it("génère des UUID version 7, triés par date", async () => {
      const a = await createTenant();
      const b = await createTenant();
      expect(a.tenant.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(a.tenant.id < b.tenant.id).toBe(true);
    });
  });

  describe("anti-doublon des rendez-vous", () => {
    it("refuse deux rendez-vous qui se chevauchent pour le même membre", async () => {
      const ctx = await createTenant();
      await appointment(ctx, "2026-11-02T09:00:00Z", "2026-11-02T10:00:00Z");
      const code = await pgErrorCode(appointment(ctx, "2026-11-02T09:30:00Z", "2026-11-02T10:30:00Z"));
      expect(code).toBe("23P01");
    });

    it("compte le temps de battement dans l'occupation de l'agenda", async () => {
      const ctx = await createTenant();
      await appointment(ctx, "2026-11-02T09:00:00Z", "2026-11-02T10:00:00Z", {
        blockedUntil: new Date("2026-11-02T10:15:00Z"),
      });
      const code = await pgErrorCode(appointment(ctx, "2026-11-02T10:00:00Z", "2026-11-02T11:00:00Z"));
      expect(code).toBe("23P01");
    });

    it("accepte deux rendez-vous qui se suivent", async () => {
      const ctx = await createTenant();
      await appointment(ctx, "2026-11-02T09:00:00Z", "2026-11-02T10:00:00Z");
      await expect(appointment(ctx, "2026-11-02T10:00:00Z", "2026-11-02T11:00:00Z")).resolves.toHaveLength(1);
    });

    it("bloque aussi pendant la réservation temporaire du paiement", async () => {
      const ctx = await createTenant();
      await appointment(ctx, "2026-11-03T09:00:00Z", "2026-11-03T10:00:00Z", {
        status: "pending_payment",
        holdExpiresAt: new Date("2026-11-01T09:10:00Z"),
      });
      const code = await pgErrorCode(appointment(ctx, "2026-11-03T09:00:00Z", "2026-11-03T10:00:00Z"));
      expect(code).toBe("23P01");
    });

    it("libère le créneau d'un rendez-vous annulé ou expiré", async () => {
      const ctx = await createTenant();
      await appointment(ctx, "2026-11-04T09:00:00Z", "2026-11-04T10:00:00Z", { status: "cancelled" });
      await appointment(ctx, "2026-11-04T09:00:00Z", "2026-11-04T10:00:00Z", { status: "expired" });
      await expect(appointment(ctx, "2026-11-04T09:00:00Z", "2026-11-04T10:00:00Z")).resolves.toHaveLength(1);
    });

    it("accepte le même créneau pour un autre membre", async () => {
      const ctx = await createTenant();
      const [other] = await db
        .insert(staffMembers)
        .values({ tenantId: ctx.tenant.id, name: "Inès" })
        .returning();
      await appointment(ctx, "2026-11-05T09:00:00Z", "2026-11-05T10:00:00Z");
      await expect(
        appointment(ctx, "2026-11-05T09:00:00Z", "2026-11-05T10:00:00Z", { staffId: other.id }),
      ).resolves.toHaveLength(1);
    });

    it("exige une fin de réservation temporaire pour un rendez-vous en attente de paiement", async () => {
      const ctx = await createTenant();
      const code = await pgErrorCode(
        appointment(ctx, "2026-11-06T09:00:00Z", "2026-11-06T10:00:00Z", { status: "pending_payment" }),
      );
      expect(code).toBe("23514");
    });
  });

  describe("liens entre tenants", () => {
    it("refuse un rendez-vous du tenant A avec un membre du tenant B", async () => {
      const a = await createTenant();
      const b = await createTenant();
      const code = await pgErrorCode(
        appointment(a, "2026-11-07T09:00:00Z", "2026-11-07T10:00:00Z", { staffId: b.staff.id }),
      );
      expect(code).toBe("23503");
    });

    it("refuse une ligne de rendez-vous qui pointe vers la prestation d'un autre tenant", async () => {
      const a = await createTenant();
      const b = await createTenant();
      const [serviceB] = await db
        .insert(services)
        .values({ tenantId: b.tenant.id, name: { fr: "Soin" }, durationMinutes: 60, priceCents: 5000 })
        .returning();
      const [appt] = await appointment(a, "2026-11-08T09:00:00Z", "2026-11-08T10:00:00Z");
      const code = await pgErrorCode(
        db.insert(appointmentItems).values({
          tenantId: a.tenant.id,
          appointmentId: appt.id,
          serviceId: serviceB.id,
          position: 1,
          serviceName: { fr: "Soin" },
          durationMinutes: 60,
          priceCents: 5000,
        }),
      );
      expect(code).toBe("23503");
    });
  });

  describe("contrôles de format", () => {
    it("exige les téléphones au format international", async () => {
      const { tenant } = await createTenant();
      const code = await pgErrorCode(
        db.insert(customers).values({ tenantId: tenant.id, firstName: "Zoé", phone: "06 12 34 56 78" }),
      );
      expect(code).toBe("23514");
      await expect(
        db.insert(customers).values({ tenantId: tenant.id, firstName: "Zoé", phone: "+33612345678" }),
      ).resolves.toBeDefined();
    });

    it("refuse deux fiches cliente avec le même e-mail chez un même tenant", async () => {
      const { tenant } = await createTenant();
      await db.insert(customers).values({ tenantId: tenant.id, firstName: "A", email: "Same@Example.com" });
      const code = await pgErrorCode(
        db.insert(customers).values({ tenantId: tenant.id, firstName: "B", email: "same@example.com" }),
      );
      expect(code).toBe("23505");
    });

    it("refuse une adresse de site invalide", async () => {
      const code = await pgErrorCode(db.insert(tenants).values({ slug: "Institut Léa", name: "X", planId }));
      expect(code).toBe("23514");
    });

    it("refuse un acompte supérieur au total", async () => {
      const ctx = await createTenant();
      const code = await pgErrorCode(
        appointment(ctx, "2026-11-09T09:00:00Z", "2026-11-09T10:00:00Z", { depositCents: 9000 }),
      );
      expect(code).toBe("23514");
    });
  });

  describe("compteurs mensuels", () => {
    it("n'autorise qu'une ligne par tenant et par mois", async () => {
      const { tenant } = await createTenant();
      await db.insert(usageCounters).values({ tenantId: tenant.id, period: "2026-11" });
      const code = await pgErrorCode(
        db.insert(usageCounters).values({ tenantId: tenant.id, period: "2026-11" }),
      );
      expect(code).toBe("23505");
    });
  });

  describe("journal de l'administratrice", () => {
    it("n'empêche pas de supprimer un compte ou un client, et garde leur trace", async () => {
      const { tenant } = await createTenant();
      const [user] = await db
        .insert(users)
        .values({ email: `trace-${Date.now()}@example.com` })
        .returning();
      await db.insert(auditLog).values({ action: "test.trace", tenantId: tenant.id, actorUserId: user.id });
      await db.delete(users).where(eq(users.id, user.id));
      await db.delete(tenants).where(eq(tenants.id, tenant.id));
      const [entry] = await db.select().from(auditLog).where(eq(auditLog.tenantId, tenant.id));
      expect(entry.actorUserId).toBe(user.id);
    });

    it("accepte l'ajout mais refuse modification et suppression", async () => {
      const [entry] = await db.insert(auditLog).values({ action: "test.created" }).returning();
      expect(
        await pgErrorCode(db.update(auditLog).set({ action: "modifié" }).where(eq(auditLog.id, entry.id))),
      ).toBe("42501");
      expect(await pgErrorCode(db.delete(auditLog).where(eq(auditLog.id, entry.id)))).toBe("42501");
      expect(await pgErrorCode(db.execute(sql`truncate audit_log`))).toBe("42501");
    });
  });
});
