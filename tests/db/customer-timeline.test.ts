import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@/db/access";
import * as s from "@/db/schema";
import { searchAppointments } from "@/modules/agenda/queries";
import { customerTimeline } from "@/modules/customers/timeline";
import { createTenantWithData } from "../setup/fixtures";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Suivi d'une fiche client : rendez-vous, visites et messages envoyés, en frise. */
describe.skipIf(!hasTestDatabase)("suivi du client", () => {
  let owner: TestDb;
  let app: TestDb;

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
  });

  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
  });

  it("réservation, rappel envoyé, visite et demande d'avis, les plus récents d'abord ; rien d'un autre site", async () => {
    const a = await createTenantWithData(owner, "suivi-a");
    const b = await createTenantWithData(owner, "suivi-b");
    const { tenant, customer, appointment, business } = a;
    await owner
      .update(s.appointments)
      .set({ status: "attended", source: "online", createdAt: new Date("2026-11-01T10:00:00Z") })
      .where(eq(s.appointments.id, appointment.id));
    const message = (templateKey: string, sentAt: Date, status: "sent" | "queued" | "failed" = "sent") => ({
      businessId: business.id,
      tenantId: tenant.id,
      appointmentId: appointment.id,
      channel: templateKey.endsWith("sms") ? ("sms" as const) : ("email" as const),
      templateKey,
      locale: "fr",
      status,
      sentAt,
    });
    await owner.insert(s.messageLog).values([
      message("customer.reminder_sms", new Date("2026-11-15T17:00:00Z")),
      message("customer.review_request", new Date("2026-11-16T12:00:00Z")),
      // Pas encore envoyé, ou en échec : absent de la frise.
      message("customer.reminder_email", new Date("2026-11-15T09:00:00Z"), "failed"),
    ]);

    const events = await withTenant(
      tenant.id,
      (tx) => customerTimeline(tx, tenant.id, customer.id, { now: new Date("2026-11-20T00:00:00Z") }),
      app,
    );
    // La commande de la boutique passée avec son e-mail figure aussi dans la frise.
    expect(events.some((event) => event.kind === "shop_order")).toBe(true);
    const visits = events.filter((event) => event.kind !== "shop_order");
    expect(visits.map((event) => [event.kind, event.channel ?? null])).toEqual([
      ["customer.review_request", "email"],
      ["attended", null],
      ["customer.reminder_sms", "sms"],
      ["booked_online", null],
    ]);
    expect(visits[1]).toMatchObject({ appointmentId: appointment.id, appointmentAt: appointment.startsAt });

    // Un autre site ne voit pas cette cliente.
    expect(
      await withTenant(b.tenant.id, (tx) => customerTimeline(tx, b.tenant.id, customer.id), app),
    ).toEqual([]);
  });

  it("agenda : « Trouver un rendez-vous » par nom ou téléphone, seulement sur son site", async () => {
    const a = await createTenantWithData(owner, "recherche-a");
    const b = await createTenantWithData(owner, "recherche-b");
    const search = (tenantId: string, query: string) =>
      withTenant(tenantId, (tx) => searchAppointments(tx, tenantId, { query, locale: "fr" }), app);
    expect((await search(a.tenant.id, "camil")).map((row) => row.id)).toContain(a.appointment.id);
    expect((await search(a.tenant.id, "06 12 34 56 78")).map((row) => row.id)).toContain(a.appointment.id);
    expect(await search(a.tenant.id, "personne-inconnue")).toEqual([]);
    // Trop court : aucune recherche.
    expect(await search(a.tenant.id, "c")).toEqual([]);
    // Le rendez-vous d'un autre site n'apparaît jamais.
    expect((await search(b.tenant.id, "camil")).map((row) => row.id)).not.toContain(a.appointment.id);
  });
});
