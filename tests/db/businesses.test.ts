import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import {
  appointments,
  assets,
  businessSettings,
  customers,
  messageLog,
  services,
  staffMembers,
  users,
} from "@/db/schema";
import { resolveManagerAccess } from "@/lib/manager/role";
import { createBooking } from "@/modules/booking/create";
import { businessOfManageToken, findByManageToken } from "@/modules/booking/manage";
import { localToUtc } from "@/modules/booking/time";
import {
  addBusinessManager,
  businessOfServices,
  createBusiness,
  replaceBusinessManager,
  setBusinessLogo,
  updateBusinessProfile,
  updateBusinessShop,
} from "@/modules/businesses/businesses";
import { loadSiteData } from "@/modules/site/data";
import { createUpdateRequest, listTenantRequests } from "@/modules/requests/update-requests";
import {
  anonymizeCustomer,
  customerDirectory,
  getCustomer,
  searchCustomers,
} from "@/modules/customers/customers";
import { assertPrimaryBusiness } from "@/modules/businesses/businesses";
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

  it("nom de boutique enregistré seul : le reste de sa page ne bouge pas", async () => {
    await platform((tx) =>
      updateBusinessProfile(tx, site.tenantId, site.natacha.id, { slug: "natacha-zen", title: "Massages" }),
    );
    await platform((tx) => updateBusinessShop(tx, site.tenantId, site.natacha.id, { shopName: "Serenity" }));
    // Enregistrer sa page (sans le champ boutique) garde le nom de boutique.
    await platform((tx) =>
      updateBusinessProfile(tx, site.tenantId, site.natacha.id, { slug: "natacha-zen", title: "Soins" }),
    );
    let data = await asBusiness(null, (tx) => loadSiteData(tx, site.tenantId));
    const natacha = () => data?.businesses.find((business) => business.id === site.natacha.id);
    expect(natacha()).toMatchObject({ slug: "natacha-zen", title: "Soins", shopName: "Serenity" });
    await platform((tx) => updateBusinessShop(tx, site.tenantId, site.natacha.id, { shopName: "" }));
    data = await asBusiness(null, (tx) => loadSiteData(tx, site.tenantId));
    expect(natacha()).toMatchObject({ slug: "natacha-zen", shopName: null });
  });

  it("chaque entreprise a ses propres réseaux sociaux (adresses vérifiées)", async () => {
    await platform((tx) =>
      updateBusinessProfile(tx, site.tenantId, site.laila.id, {
        slug: "laila",
        instagram: "https://www.instagram.com/laila.beaute",
        facebook: "https://www.facebook.com/laila.beaute",
      }),
    );
    // Un pseudo ou un autre site est refusé : seules les adresses Instagram et Facebook passent.
    await expect(
      platform((tx) => updateBusinessProfile(tx, site.tenantId, site.natacha.id, { instagram: "@natacha" })),
    ).rejects.toThrow();
    await expect(
      platform((tx) =>
        updateBusinessProfile(tx, site.tenantId, site.natacha.id, { facebook: "https://exemple.fr/natacha" }),
      ),
    ).rejects.toThrow();
    // Sans champs réseaux : les liens restent ; champs vides : retirés.
    await platform((tx) => updateBusinessProfile(tx, site.tenantId, site.laila.id, { slug: "laila" }));
    let data = await asBusiness(null, (tx) => loadSiteData(tx, site.tenantId));
    expect(data?.businesses[0].social).toEqual({
      instagram: "https://www.instagram.com/laila.beaute",
      facebook: "https://www.facebook.com/laila.beaute",
    });
    expect(data?.businesses[1].social).toEqual({});
    await platform((tx) =>
      updateBusinessProfile(tx, site.tenantId, site.laila.id, { slug: "laila", instagram: "", facebook: "" }),
    );
    data = await asBusiness(null, (tx) => loadSiteData(tx, site.tenantId));
    expect(data?.businesses[0].social).toEqual({});
  });

  it("une entreprise a son nom de boutique et son logo (l'ancien logo est mis de côté)", async () => {
    const newLogo = (name: string) =>
      platform(async (tx) => {
        const [asset] = await tx
          .insert(assets)
          .values({
            tenantId: site.tenantId,
            kind: "other",
            storageKey: `${name}.webp`,
            mimeType: "image/webp",
            bytes: 100,
          })
          .returning();
        return asset.id;
      });
    const first = await newLogo("logo-1");
    const second = await newLogo("logo-2");
    await platform((tx) => setBusinessLogo(tx, site.tenantId, site.natacha.id, first));
    await platform((tx) => setBusinessLogo(tx, site.tenantId, site.natacha.id, second));
    await platform((tx) =>
      updateBusinessProfile(tx, site.tenantId, site.natacha.id, { shopName: "Zen & Bien-être" }),
    );
    const [old] = await platform((tx) => tx.select().from(assets).where(eq(assets.id, first)));
    expect(old.status).toBe("replaced");
    const data = await asBusiness(null, (tx) => loadSiteData(tx, site.tenantId));
    const natacha = data?.businesses.find((business) => business.id === site.natacha.id);
    expect(natacha?.shopName).toBe("Zen & Bien-être");
    expect(natacha?.logo?.key).toBe("logo-2.webp");
    expect(
      await errorCode(
        platform((tx) =>
          setBusinessLogo(tx, site.tenantId, site.natacha.id, "01890000-0000-7000-8000-000000000000"),
        ),
      ),
    ).toBe("invalid");
    await platform((tx) => setBusinessLogo(tx, site.tenantId, site.natacha.id, null));
    await platform((tx) => updateBusinessProfile(tx, site.tenantId, site.natacha.id, { shopName: "" }));
    const cleared = await asBusiness(null, (tx) => loadSiteData(tx, site.tenantId));
    expect(cleared?.businesses.find((business) => business.id === site.natacha.id)).toMatchObject({
      shopName: null,
      logo: null,
    });
  });

  it("l'admin donne l'accès gérante à une entreprise créée sans gérante", async () => {
    const { business } = await platform((tx) => createBusiness(tx, site.tenantId, { name: "Sans gérante" }));
    const { managerId } = await platform((tx) =>
      addBusinessManager(tx, site.tenantId, {
        businessId: business.id,
        email: "Nouvelle.Gerante@exemple.fr",
        name: "Nouvelle",
      }),
    );
    const access = await resolveManagerAccess(
      { user: { id: managerId }, session: {} },
      site.tenantId,
      business.id,
      app,
    );
    expect(access).toEqual({ role: "owner", businessId: business.id });
    const [laila] = await owner.select().from(users).where(eq(users.id, site.laila.managerId));
    expect(
      await errorCode(
        platform((tx) =>
          addBusinessManager(tx, site.tenantId, { businessId: business.id, email: laila.email }),
        ),
      ),
    ).toBe("business_has_manager");
    expect(
      await errorCode(
        platform((tx) =>
          addBusinessManager(tx, site.tenantId, { businessId: business.id, email: "pas-un-email" }),
        ),
      ),
    ).toBe("invalid");
  });

  it("l'admin remplace la gérante d'une entreprise : l'ancienne perd l'accès", async () => {
    const { business } = await platform((tx) => createBusiness(tx, site.tenantId, { name: "Relais" }));
    const { managerId: before } = await platform((tx) =>
      addBusinessManager(tx, site.tenantId, { businessId: business.id, email: "avant@exemple.fr" }),
    );
    await owner
      .update(businessSettings)
      .set({ calendarFeedVersion: 3 })
      .where(eq(businessSettings.businessId, business.id));
    const { managerId: after, removedIds } = await platform((tx) =>
      replaceBusinessManager(tx, site.tenantId, { businessId: business.id, email: "apres@exemple.fr" }),
    );
    expect(removedIds).toEqual([before]);
    // Le lien d'agenda du téléphone de l'ancienne gérante est coupé.
    const [settings] = await owner
      .select({ version: businessSettings.calendarFeedVersion })
      .from(businessSettings)
      .where(eq(businessSettings.businessId, business.id));
    expect(settings.version).toBe(0);
    const access = (userId: string) =>
      resolveManagerAccess({ user: { id: userId }, session: {} }, site.tenantId, business.id, app);
    expect(await access(after)).toEqual({ role: "owner", businessId: business.id });
    expect(await access(before)).toBeNull();
    // Une gérante d'une autre entreprise du site ne peut pas être reprise ici.
    const [laila] = await owner.select().from(users).where(eq(users.id, site.laila.managerId));
    expect(
      await errorCode(
        platform((tx) =>
          replaceBusinessManager(tx, site.tenantId, { businessId: business.id, email: laila.email }),
        ),
      ),
    ).toBe("manager_already_linked");
  });

  it("chaque entreprise ne voit que ses demandes de modification", async () => {
    await asBusiness(site.laila.id, (tx) =>
      createUpdateRequest(tx, site.tenantId, site.laila.managerId, {
        subject: "Photo",
        message: "Nouvelle photo",
      }),
    );
    await asBusiness(site.natacha.id, (tx) =>
      createUpdateRequest(tx, site.tenantId, site.natacha.managerId, { subject: "Tarifs", message: "Prix" }),
    );
    const subjects = async (businessId: string) =>
      (await asBusiness(businessId, (tx) => listTenantRequests(tx, site.tenantId))).map((r) => r.subject);
    expect(await subjects(site.laila.id)).toEqual(["Photo"]);
    expect(await subjects(site.natacha.id)).toEqual(["Tarifs"]);
  });

  it("photos et avis du site : réservés à l'entreprise principale", async () => {
    await platform((tx) =>
      assertPrimaryBusiness(tx, site.tenantId, site.laila.id, "site_content_primary_only"),
    );
    expect(
      await errorCode(
        platform((tx) =>
          assertPrimaryBusiness(tx, site.tenantId, site.natacha.id, "site_content_primary_only"),
        ),
      ),
    ).toBe("site_content_primary_only");
  });

  it("effacer les données d'une cliente garde ses rendez-vous, sans nom ni coordonnées", async () => {
    const [camille] = await asBusiness(site.laila.id, (tx) => searchCustomers(tx, site.tenantId, "camille"));
    expect(camille).toBeDefined();
    await asBusiness(site.laila.id, (tx) =>
      anonymizeCustomer(tx, site.tenantId, camille.id, "Cliente effacée"),
    );
    const detail = await asBusiness(site.laila.id, (tx) => getCustomer(tx, site.tenantId, camille.id, "fr"));
    expect(detail?.customer).toMatchObject({
      firstName: "Cliente effacée",
      email: null,
      phone: null,
      notes: null,
    });
    expect(detail?.history.length).toBeGreaterThan(0);
    // Plus proposée dans la recherche ni dans la liste ; la fiche de l'autre entreprise est intacte.
    expect(await asBusiness(site.laila.id, (tx) => searchCustomers(tx, site.tenantId, "camille"))).toEqual(
      [],
    );
    const directory = await asBusiness(site.laila.id, (tx) =>
      customerDirectory(tx, site.tenantId, { now: new Date() }),
    );
    expect(directory.customers.some((c) => c.id === camille.id)).toBe(false);
    expect(
      await asBusiness(site.natacha.id, (tx) => searchCustomers(tx, site.tenantId, "camille")),
    ).toHaveLength(1);
  });
});
