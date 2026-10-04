import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { appointments, customers, messageLog, services, staffMembers, users } from "@/db/schema";
import { resolveManagerAccess } from "@/lib/manager/role";
import { createBooking } from "@/modules/booking/create";
import { businessOfManageToken, findByManageToken } from "@/modules/booking/manage";
import { localToUtc } from "@/modules/booking/time";
import { businessOfServices, createBusiness, updateBusinessProfile } from "@/modules/businesses/businesses";
import { loadSiteData } from "@/modules/site/data";
import { listServices, saveService } from "@/modules/catalog/services";
import { AppError } from "@/modules/errors";
import { countUsage } from "@/modules/quotas";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { changeStatus } from "@/modules/tenants/update";
import { hasTestDatabase, openAppDb, openTestDb, pgErrorCode, type TestDb } from "../setup/db";

/**
 * Un site, deux entreprises (deux indépendantes dans le même institut, chacune
 * avec son SIRET) : chacune ne voit que ses clientes, ses rendez-vous et ses
 * paiements, comme deux sites différents ; la vitrine (prestations, équipe) est commune.
 */
const TZ = "Europe/Paris";
const NOW = localToUtc("2026-10-05", "09:00", TZ);
const at = (time: string) => localToUtc("2026-10-06", time, TZ);

describe.skipIf(!hasTestDatabase)("plusieurs entreprises sur un même site", () => {
  let owner: TestDb;
  let app: TestDb;
  let site: {
    tenantId: string;
    laila: { id: string; managerId: string; serviceId: string; staffId: string };
    natacha: { id: string; managerId: string; serviceId: string; staffId: string };
  };
  let lailaBooking: Awaited<ReturnType<typeof createBooking>>;

  const platform = <T>(fn: (tx: Transaction) => Promise<T>, businessId?: string) =>
    withPlatform(fn, app, businessId);
  const asBusiness = <T>(businessId: string | null | undefined, fn: (tx: Transaction) => Promise<T>) =>
    withTenant(site.tenantId, fn, app, businessId);

  async function errorCode(promise: Promise<unknown>) {
    try {
      await promise;
      return undefined;
    } catch (error) {
      if (error instanceof AppError) return error.code;
      throw error;
    }
  }

  function book(businessId: string, serviceId: string, email: string, time = "10:00") {
    return asBusiness(businessId, (tx) =>
      createBooking(
        tx,
        site.tenantId,
        {
          serviceIds: [serviceId],
          staffId: null,
          start: at(time),
          customer: { firstName: "Camille", email, phone: "06 12 34 56 78" },
        },
        { now: NOW },
      ),
    );
  }

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
    const slug = `duo-${Date.now().toString(36)}`;
    const created = await platform((tx) =>
      createTenant(tx, {
        name: "Institut Duo",
        slug,
        planCode: "serenite",
        managerEmail: `laila-${slug}@example.com`,
      }),
    );
    const tenantId = created.tenant.id;
    const second = await platform((tx) =>
      createBusiness(tx, tenantId, {
        name: "Natacha",
        siret: "987 654 321 00019",
        managerEmail: `natacha-${slug}@example.com`,
      }),
    );
    const fill = async (businessId: string, service: string, staff: string) => {
      await platform(
        (tx) => replaceOpeningHours(tx, tenantId, [{ weekday: 2, opensAt: "09:00", closesAt: "19:00" }]),
        businessId,
      );
      const saved = await platform(
        (tx) => saveService(tx, tenantId, { name: service, durationMinutes: 60, price: "60" }),
        businessId,
      );
      const member = await platform(
        (tx) => saveStaff(tx, tenantId, { name: staff, serviceIds: [saved.id] }),
        businessId,
      );
      return { serviceId: saved.id, staffId: member.id };
    };
    const lailaContent = await fill(created.business.id, "Réhaussement de cils", "Laïla");
    const natachaContent = await fill(second.business.id, "Deep tissue", "Natacha");
    await platform((tx) => changeStatus(tx, tenantId, "activate"));
    site = {
      tenantId,
      laila: { id: created.business.id, managerId: created.managerId, ...lailaContent },
      natacha: { id: second.business.id, managerId: second.managerId!, ...natachaContent },
    };
    // Même cliente chez les deux : deux fiches distinctes, une par entreprise.
    lailaBooking = await book(site.laila.id, site.laila.serviceId, "camille@example.com");
    await book(site.natacha.id, site.natacha.serviceId, "camille@example.com");
  });

  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
  });

  it("chaque entreprise ne voit que ses clientes et ses rendez-vous", async () => {
    for (const [mine, other] of [
      [site.laila, site.natacha],
      [site.natacha, site.laila],
    ]) {
      const seen = await asBusiness(mine.id, async (tx) => ({
        customers: await tx.select().from(customers),
        appointments: await tx.select().from(appointments),
      }));
      expect(seen.customers).toHaveLength(1);
      expect(seen.appointments).toHaveLength(1);
      expect(seen.appointments[0].staffId).toBe(mine.staffId);
      expect(seen.appointments.some((row) => row.staffId === other.staffId)).toBe(false);
    }
  });

  it("une entreprise ne peut ni modifier ni supprimer les rendez-vous de l'autre", async () => {
    const updated = await asBusiness(site.natacha.id, (tx) =>
      tx
        .update(appointments)
        .set({ internalNote: "piratage" })
        .where(eq(appointments.id, lailaBooking.appointmentId))
        .returning(),
    );
    expect(updated).toHaveLength(0);
    const deleted = await asBusiness(site.natacha.id, (tx) =>
      tx.delete(appointments).where(eq(appointments.id, lailaBooking.appointmentId)).returning(),
    );
    expect(deleted).toHaveLength(0);
    const [still] = await owner
      .select()
      .from(appointments)
      .where(eq(appointments.id, lailaBooking.appointmentId));
    expect(still.internalNote).toBeNull();
  });

  it("une entreprise ne peut pas ajouter de ligne au nom de l'autre", async () => {
    expect(
      await pgErrorCode(
        asBusiness(site.natacha.id, (tx) =>
          tx.insert(services).values({
            tenantId: site.tenantId,
            businessId: site.laila.id,
            name: { fr: "Faux soin" },
            durationMinutes: 30,
            priceCents: 1000,
          }),
        ),
      ),
    ).toBe("42501");
    // Une prestation de Laïla ne peut pas être modifiée depuis l'espace de Natacha.
    const changed = await asBusiness(site.natacha.id, (tx) =>
      tx.update(services).set({ priceCents: 1 }).where(eq(services.id, site.laila.serviceId)).returning(),
    );
    expect(changed).toHaveLength(0);
  });

  it("la vue « site » (pages publiques) montre la vitrine des deux, sans données privées", async () => {
    const seen = await asBusiness(null, async (tx) => ({
      services: await tx.select().from(services),
      staff: await tx.select().from(staffMembers),
      customers: await tx.select().from(customers),
      appointments: await tx.select().from(appointments),
    }));
    expect(seen.services.map((row) => row.id).sort()).toEqual(
      [site.laila.serviceId, site.natacha.serviceId].sort(),
    );
    expect(seen.staff).toHaveLength(2);
    expect(seen.customers).toHaveLength(0);
    expect(seen.appointments).toHaveLength(0);
  });

  it("sans entreprise précisée, un site à deux entreprises n'en choisit aucune au hasard", async () => {
    const seen = await asBusiness(undefined, (tx) => tx.select().from(appointments));
    expect(seen).toHaveLength(0);
    // Côté administratrice non plus : l'ajout sans entreprise déclarée est refusé.
    expect(
      await pgErrorCode(
        platform((tx) =>
          saveService(tx, site.tenantId, { name: "Sans entreprise", durationMinutes: 30, price: "10" }),
        ),
      ),
    ).toBe("23502");
  });

  it("un rendez-vous ne mélange jamais les prestations de deux entreprises", async () => {
    expect(
      await errorCode(
        asBusiness(null, (tx) =>
          businessOfServices(tx, site.tenantId, [site.laila.serviceId, site.natacha.serviceId]),
        ),
      ),
    ).toBe("services_mixed");
    expect(
      await asBusiness(null, (tx) => businessOfServices(tx, site.tenantId, [site.natacha.serviceId])),
    ).toBe(site.natacha.id);
    // La prestation de Natacha n'est pas réservable dans le contexte de Laïla.
    expect(await errorCode(book(site.laila.id, site.natacha.serviceId, "autre@example.com", "14:00"))).toBe(
      "service_unavailable",
    );
  });

  it("le lien de gestion retrouve l'entreprise du rendez-vous, et seulement elle", async () => {
    const businessId = await asBusiness(null, (tx) =>
      businessOfManageToken(tx, site.tenantId, lailaBooking.manageToken),
    );
    expect(businessId).toBe(site.laila.id);
    expect(
      await asBusiness(site.natacha.id, (tx) =>
        findByManageToken(tx, site.tenantId, lailaBooking.manageToken),
      ),
    ).toBeNull();
    const managed = await asBusiness(site.laila.id, (tx) =>
      findByManageToken(tx, site.tenantId, lailaBooking.manageToken),
    );
    expect(managed?.context.business.id).toBe(site.laila.id);
  });

  it("les messages d'un rendez-vous sont rattachés à son entreprise", async () => {
    const rows = await owner
      .select({ businessId: messageLog.businessId })
      .from(messageLog)
      .where(eq(messageLog.appointmentId, lailaBooking.appointmentId));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.businessId === site.laila.id)).toBe(true);
  });

  it("l'administratrice qui précise une entreprise ne voit que ses lignes", async () => {
    const lailaServices = await platform((tx) => listServices(tx, site.tenantId), site.laila.id);
    expect(lailaServices.map((row) => row.id)).toEqual([site.laila.serviceId]);
  });

  it("les quotas du pack se comptent au niveau du site", async () => {
    const counts = await asBusiness(site.laila.id, async (tx) => ({
      services: await countUsage(tx, site.tenantId, "services"),
      members: await countUsage(tx, site.tenantId, "members"),
    }));
    expect(counts).toEqual({ services: 2, members: 2 });
  });

  it("chaque gérante entre dans sa propre entreprise ; une gérante n'est liée qu'à une entreprise du site", async () => {
    const access = await resolveManagerAccess(
      { user: { id: site.natacha.managerId }, session: {} },
      site.tenantId,
      site.laila.id,
      app,
    );
    expect(access).toEqual({ role: "owner", businessId: site.natacha.id });
    const [laila] = await owner.select().from(users).where(eq(users.id, site.laila.managerId));
    expect(
      await errorCode(
        platform((tx) => createBusiness(tx, site.tenantId, { name: "Troisième", managerEmail: laila.email })),
      ),
    ).toBe("manager_already_linked");
  });

  it("chaque entreprise a sa page sur le site (adresse unique, textes, photo du site seulement)", async () => {
    await platform((tx) =>
      updateBusinessProfile(tx, site.tenantId, site.laila.id, {
        slug: "laila",
        title: "Esthétique",
        role: "Esthéticienne, spécialiste du regard",
        availability: "Du lundi au samedi",
      }),
    );
    expect(
      await errorCode(
        platform((tx) => updateBusinessProfile(tx, site.tenantId, site.natacha.id, { slug: "laila" })),
      ),
    ).toBe("slug_taken");
    expect(
      await errorCode(
        platform((tx) => updateBusinessProfile(tx, site.tenantId, site.natacha.id, { slug: "Pas valide !" })),
      ),
    ).toBe("slug_invalid");
    expect(
      await errorCode(
        platform((tx) =>
          updateBusinessProfile(tx, site.tenantId, site.natacha.id, {
            photoAssetId: "01890000-0000-7000-8000-000000000000",
          }),
        ),
      ),
    ).toBe("invalid");
    // Sans adresse saisie : proposée à partir du nom.
    await platform((tx) => updateBusinessProfile(tx, site.tenantId, site.natacha.id, { title: "Massages" }));
    const data = await asBusiness(null, (tx) => loadSiteData(tx, site.tenantId));
    expect(data?.businesses.map((business) => [business.slug, business.title])).toEqual([
      ["laila", "Esthétique"],
      ["natacha", "Massages"],
    ]);
    expect(data?.businesses[0]).toMatchObject({
      role: "Esthéticienne, spécialiste du regard",
      availability: "Du lundi au samedi",
    });
  });
});
