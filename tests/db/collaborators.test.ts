import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { businesses, memberships, messageLog, staffMembers } from "@/db/schema";
import { resolveManagerAccess } from "@/lib/manager/role";
import { AppError } from "@/modules/errors";
import { queueMessage } from "@/modules/messages/queue";
import { renderMessage } from "@/modules/messages/render";
import {
  agendaStaffFilter,
  canAccess,
  inviteCollaborator,
  listCollaborators,
  removeCollaborator,
  updateCollaborator,
  type SpaceAccess,
} from "@/modules/team/access";
import { deleteStaff, saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

describe("collaborateurs : parties de l'espace ouvertes", () => {
  const owner: SpaceAccess = { role: "owner", permissions: {}, staffMemberId: null };
  const admin: SpaceAccess = { role: "admin", permissions: {}, staffMemberId: null };
  const lea = "11111111-1111-4111-8111-111111111111";
  const agendaOnly: SpaceAccess = { role: "collaborator", permissions: {}, staffMemberId: lea };

  it("la gérante et l'administratrice ont tout ; le collaborateur, l'agenda et ce qui est coché", () => {
    for (const area of ["agenda", "customers", "stats", "site", "shop", "marketing", "owner"] as const) {
      expect(canAccess(owner, area)).toBe(true);
      expect(canAccess(admin, area)).toBe(true);
    }
    expect(canAccess(agendaOnly, "agenda")).toBe(true);
    for (const area of ["customers", "stats", "site", "shop", "marketing", "owner"] as const)
      expect(canAccess(agendaOnly, area)).toBe(false);
    const withCustomers: SpaceAccess = { ...agendaOnly, permissions: { customers: true, site: true } };
    expect(canAccess(withCustomers, "customers")).toBe(true);
    expect(canAccess(withCustomers, "site")).toBe(true);
    expect(canAccess(withCustomers, "stats")).toBe(false);
    // Réservé à la gérante, même si une case du même nom existait.
    expect(canAccess({ ...agendaOnly, permissions: { owner: true } as never }, "owner")).toBe(false);
  });

  it("agenda : ses rendez-vous par défaut, toute l'équipe si la gérante l'a choisi", () => {
    expect(agendaStaffFilter(owner)).toBeNull();
    expect(agendaStaffFilter(agendaOnly)).toBe(lea);
    expect(agendaStaffFilter({ ...agendaOnly, permissions: { agendaScope: "all" } })).toBeNull();
    // Sans fiche d'équipe : aucun rendez-vous, jamais tout l'agenda.
    expect(agendaStaffFilter({ ...agendaOnly, staffMemberId: null })).not.toBeNull();
  });
});

describe.skipIf(!hasTestDatabase)("collaborateurs : invitation et accès", () => {
  let owner: TestDb;
  let app: TestDb;
  let n = 0;

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
  });
  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
  });

  const platform = <T>(fn: (tx: Transaction) => Promise<T>) => withPlatform(fn, app);

  async function errorCode(promise: Promise<unknown>) {
    try {
      await promise;
      return undefined;
    } catch (error) {
      if (error instanceof AppError) return error.code;
      throw error;
    }
  }

  async function setup() {
    n += 1;
    const slug = `equipe-${n}-${Date.now().toString(36)}`;
    const managerEmail = `${slug}@example.com`;
    const { tenant, managerId } = await platform((tx) =>
      createTenant(tx, { name: `Institut ${n}`, slug, planCode: "pro", managerEmail }),
    );
    const [business] = await platform((tx) =>
      tx
        .select()
        .from(businesses)
        .where(and(eq(businesses.tenantId, tenant.id), eq(businesses.isPrimary, true))),
    );
    const lea = await platform((tx) => saveStaff(tx, tenant.id, { name: "Léa", serviceIds: [] }));
    return { id: tenant.id, managerId, managerEmail, businessId: business.id, lea, slug };
  }

  const invite = (
    s: Awaited<ReturnType<typeof setup>>,
    email: string,
    permissions: Record<string, unknown> = {},
    staffId = s.lea.id,
  ) =>
    platform((tx) =>
      inviteCollaborator(tx, s.id, {
        staffId,
        email,
        permissions,
        businessId: s.businessId,
        locale: "fr",
      }),
    );

  it("la gérante invite un membre : accès collaborateur, droits choisis, invitation envoyée à son adresse", async () => {
    const s = await setup();
    const email = `lea-${s.slug}@example.com`;
    const { userId } = await invite(s, email.toUpperCase(), { customers: true });

    const access = await resolveManagerAccess({ user: { id: userId }, session: {} }, s.id, null, app);
    expect(access).toEqual({
      role: "collaborator",
      businessId: s.businessId,
      permissions: {
        agendaScope: "own",
        customers: true,
        stats: false,
        site: false,
        shop: false,
        marketing: false,
      },
      staffMemberId: s.lea.id,
    });
    // Le membre d'équipe est relié à son compte.
    const [member] = await owner.select().from(staffMembers).where(eq(staffMembers.id, s.lea.id));
    expect(member.userId).toBe(userId);

    const [message] = await owner
      .select()
      .from(messageLog)
      .where(and(eq(messageLog.tenantId, s.id), eq(messageLog.templateKey, "collaborator.invite")));
    const rendered = await platform((tx) =>
      renderMessage(tx, message, { appUrl: "https://sirine.test", productName: "Sirine" } as never),
    );
    expect(rendered).toMatchObject({ kind: "email", to: [email] });
    if (rendered.kind === "email") expect(rendered.text).toContain(`https://sirine.test/fr/espace/${s.id}`);

    const listed = await platform((tx) => listCollaborators(tx, s.id, s.businessId));
    expect(listed.map((row) => [row.staffMemberId, row.email])).toEqual([[s.lea.id, email]]);
  });

  it("une seule invitation par membre ; jamais la gérante elle-même ; jamais un membre d'un autre site", async () => {
    const s = await setup();
    const other = await setup();
    await invite(s, `lea-${s.slug}@example.com`);
    expect(await errorCode(invite(s, `autre-${s.slug}@example.com`))).toBe("collaborator_already_invited");
    const ines = await platform((tx) => saveStaff(tx, s.id, { name: "Inès", serviceIds: [] }));
    expect(await errorCode(invite(s, s.managerEmail, {}, ines.id))).toBe("collaborator_already_member");
    expect(await errorCode(invite(s, `x-${s.slug}@example.com`, {}, other.lea.id))).toBe("not_found");
    await expect(invite(s, "pas-une-adresse", {}, ines.id)).rejects.toThrow();
  });

  it("les droits changent ; retirer l'accès ou supprimer le membre ferme l'espace", async () => {
    const s = await setup();
    const { userId } = await invite(s, `lea-${s.slug}@example.com`);
    const session = { user: { id: userId }, session: {} };

    await platform((tx) =>
      updateCollaborator(tx, s.id, {
        staffId: s.lea.id,
        businessId: s.businessId,
        permissions: { agendaScope: "all", stats: true },
      }),
    );
    const updated = await resolveManagerAccess(session, s.id, null, app);
    expect(updated?.permissions).toMatchObject({ agendaScope: "all", stats: true, customers: false });

    await platform((tx) => removeCollaborator(tx, s.id, { staffId: s.lea.id, businessId: s.businessId }));
    expect(await resolveManagerAccess(session, s.id, null, app)).toBeNull();
    const [member] = await owner.select().from(staffMembers).where(eq(staffMembers.id, s.lea.id));
    expect(member.userId).toBeNull();

    // Membre désactivé (parti du salon) : plus d'accès, revenu dès qu'il est réactivé.
    const back = await invite(s, `lea-${s.slug}@example.com`);
    const backSession = { user: { id: back.userId }, session: {} };
    await owner.update(staffMembers).set({ isActive: false }).where(eq(staffMembers.id, s.lea.id));
    expect(await resolveManagerAccess(backSession, s.id, null, app)).toBeNull();
    await owner.update(staffMembers).set({ isActive: true }).where(eq(staffMembers.id, s.lea.id));
    expect((await resolveManagerAccess(backSession, s.id, null, app))?.role).toBe("collaborator");
    await platform((tx) => removeCollaborator(tx, s.id, { staffId: s.lea.id, businessId: s.businessId }));

    // Nouvel accès, puis suppression du membre par la gérante (rôle du tenant) : l'accès part avec lui.
    const again = await invite(s, `lea-${s.slug}@example.com`);
    await withTenant(s.id, (tx) => deleteStaff(tx, s.id, s.lea.id), app);
    expect(
      await resolveManagerAccess({ user: { id: again.userId }, session: {} }, s.id, null, app),
    ).toBeNull();
  });

  it("les alertes de l'établissement ne vont qu'à la gérante, pas aux collaborateurs", async () => {
    const s = await setup();
    await invite(s, `lea-${s.slug}@example.com`);
    await platform((tx) =>
      queueMessage(tx, {
        tenantId: s.id,
        businessId: s.businessId,
        template: "manager.stripe_invite",
        dedupeKey: null,
      }),
    );
    const [message] = await owner
      .select()
      .from(messageLog)
      .where(and(eq(messageLog.tenantId, s.id), eq(messageLog.templateKey, "manager.stripe_invite")));
    const rendered = await platform((tx) =>
      renderMessage(tx, message, { appUrl: "https://sirine.test", productName: "Sirine" } as never),
    );
    expect(rendered).toMatchObject({ kind: "email", to: [s.managerEmail] });
    const owners = await owner
      .select()
      .from(memberships)
      .where(and(eq(memberships.tenantId, s.id), eq(memberships.role, "owner")));
    expect(owners).toHaveLength(1);
  });
});
