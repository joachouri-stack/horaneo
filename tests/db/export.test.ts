import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { customers, plans, subscriptions } from "@/db/schema";
import { createBooking } from "@/modules/booking/create";
import { localToUtc } from "@/modules/booking/time";
import { createBusiness } from "@/modules/businesses/businesses";
import { saveService } from "@/modules/catalog/services";
import { businessDataExport, dataExportAllowed } from "@/modules/export/business-data";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { changeStatus } from "@/modules/tenants/update";
import { toCsv } from "@/lib/export/csv";
import { createFakeGateway } from "../setup/fake-gateway";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Export des données de la gérante : seulement son entreprise, rendez-vous avec leurs prestations. */
const TZ = "Europe/Paris";

describe.skipIf(!hasTestDatabase)("export des données", () => {
  let owner: TestDb;
  let app: TestDb;
  const gateway = createFakeGateway();

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
  });

  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
  });

  const platform = <T>(fn: (tx: Transaction) => Promise<T>) => withPlatform(fn, app);

  it("ne contient que les données de l'entreprise de la gérante", async () => {
    const slug = `export-${Date.now().toString(36)}`;
    const { tenant, business } = await platform((tx) =>
      createTenant(tx, {
        name: "Institut Export",
        slug,
        planCode: "serenite",
        managerEmail: `${slug}@example.com`,
      }),
    );
    await platform((tx) =>
      replaceOpeningHours(tx, tenant.id, [{ weekday: 2, opensAt: "09:00", closesAt: "18:00" }]),
    );
    const massage = await platform((tx) =>
      saveService(tx, tenant.id, { name: "Massage", durationMinutes: 60, price: "70" }),
    );
    await platform((tx) => saveStaff(tx, tenant.id, { name: "Léa", serviceIds: [massage.id] }));
    await platform((tx) => changeStatus(tx, tenant.id, "activate"));
    // Deuxième entreprise du site, créée après la mise en place de la première.
    const { business: other } = await platform((tx) => createBusiness(tx, tenant.id, { name: "Natacha" }));
    await owner.insert(customers).values({
      tenantId: tenant.id,
      businessId: other.id,
      firstName: "Autre",
      email: `autre-${slug}@example.com`,
    });
    await withTenant(
      tenant.id,
      (tx) =>
        createBooking(
          tx,
          tenant.id,
          {
            serviceIds: [massage.id],
            staffId: null,
            start: localToUtc("2026-10-06", "10:00", TZ),
            customer: { firstName: "Camille", email: `camille-${slug}@example.com`, phone: "06 12 34 56 78" },
          },
          { now: localToUtc("2026-10-05", "09:00", TZ), gateway: gateway.gateway, source: "manual" },
        ),
      app,
      business.id,
    );

    const data = await withTenant(tenant.id, (tx) => businessDataExport(tx, tenant.id), app, business.id);
    expect(data.customers.map((row) => row.firstName)).toEqual(["Camille"]);
    expect(data.services.map((row) => row.name.fr)).toEqual(["Massage"]);
    expect(data.appointments).toHaveLength(1);
    expect(data.appointments[0]).toMatchObject({ staffName: "Léa", customerFirstName: "Camille" });
    expect(data.appointments[0].services.map((name) => name.fr)).toEqual(["Massage"]);

    const theirs = await withTenant(tenant.id, (tx) => businessDataExport(tx, tenant.id), app, other.id);
    expect(theirs.customers.map((row) => row.firstName)).toEqual(["Autre"]);
    expect(theirs.appointments).toHaveLength(0);
  });

  it("export : packs Pro et Business, ou n'importe quel pack en cours de résiliation", async () => {
    const slug = `export-starter-${Date.now().toString(36)}`;
    const { tenant } = await platform((tx) =>
      createTenant(tx, {
        name: "Institut Starter",
        slug,
        planCode: "starter",
        managerEmail: `${slug}@example.com`,
      }),
    );
    const allowed = () =>
      withTenant(tenant.id, (tx) => dataExportAllowed(tx, tenant.id, { dataExport: false }), app);
    expect(
      await withTenant(tenant.id, (tx) => dataExportAllowed(tx, tenant.id, { dataExport: true }), app),
    ).toBe(true);
    expect(await allowed()).toBe(false);
    const [starter] = await owner.select({ id: plans.id }).from(plans).where(eq(plans.code, "starter"));
    await owner
      .insert(subscriptions)
      .values({ tenantId: tenant.id, planId: starter.id, status: "active" })
      .onConflictDoNothing();
    expect(await allowed()).toBe(false);
    await owner
      .update(subscriptions)
      .set({ cancelAt: new Date("2026-12-01T00:00:00Z") })
      .where(eq(subscriptions.tenantId, tenant.id));
    expect(await allowed()).toBe(true);
  });

  it("CSV lisible par un tableur : séparateur « ; », guillemets, pas de formule", () => {
    const csv = toCsv(
      ["Nom", "Note"],
      [
        ["Camille", 'dit "bonjour"; merci'],
        ["=SOMME(A1)", "+33612345678"],
      ],
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿Nom;Note\r\nCamille;"dit ""bonjour""; merci"\r\n\'=SOMME(A1);+33612345678\r\n');
    // Formules déguisées derrière + ou - : neutralisées aussi ; un nombre négatif reste un nombre.
    expect(toCsv(["A", "B", "C"], [["-1+1+cmd|' /C calc'!A0", "+1+HYPERLINK(1)", "-12,5"]])).toBe(
      "\uFEFFA;B;C\r\n'-1+1+cmd|' /C calc'!A0;'+1+HYPERLINK(1);-12,5\r\n",
    );
  });
});
