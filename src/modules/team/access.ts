import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import {
  appointments,
  memberships,
  staffMembers,
  timeOff,
  users,
  type CollaboratorPermissions,
} from "@/db/schema";
import { ensureUser } from "@/modules/businesses/businesses";
import { AppError } from "@/modules/errors";
import { queueMessage } from "@/modules/messages/queue";

/**
 * Accès des collaborateurs à l'espace : la gérante invite un membre de son
 * équipe (son e-mail) et choisit ce qu'il peut voir et modifier. Il se connecte
 * comme elle (lien ou code reçu par e-mail, ou Google) et retrouve un espace
 * réduit à ces parties.
 *
 * Les accès (table memberships) ne s'écrivent qu'avec le rôle plateforme :
 * ces fonctions filtrent donc elles-mêmes sur l'établissement et l'entreprise.
 */

/** Parties de l'espace qu'une case ouvre au collaborateur. */
export const PERMISSION_AREAS = ["customers", "stats", "site", "shop", "marketing"] as const;
export type PermissionArea = (typeof PERMISSION_AREAS)[number];

/**
 * Partie de l'espace d'une page ou d'une action :
 * - « agenda » : toujours ouvert (ses rendez-vous, ou ceux de toute l'équipe) ;
 * - une case de PERMISSION_AREAS : ouverte si la gérante l'a cochée ;
 * - « owner » : réservé à la gérante (abonnement, équipe, paiements, réglages…).
 */
export type ManagerArea = "agenda" | PermissionArea | "owner";

/** Toutes les parties de l'espace (menus de navigation). */
export const MANAGER_AREAS: ManagerArea[] = ["agenda", ...PERMISSION_AREAS, "owner"];

export type SpaceRole = "owner" | "admin" | "collaborator";

export type SpaceAccess = {
  role: SpaceRole;
  permissions: CollaboratorPermissions;
  /** Collaborateur : son membre d'équipe. */
  staffMemberId: string | null;
};

/** Aucun membre : un collaborateur sans fiche d'équipe ne voit aucun rendez-vous. */
const NO_STAFF = "00000000-0000-0000-0000-000000000000";

/** La personne connectée peut-elle ouvrir cette partie de l'espace ? */
export function canAccess(access: SpaceAccess, area: ManagerArea): boolean {
  if (access.role !== "collaborator") return true;
  if (area === "owner") return false;
  if (area === "agenda") return true;
  return access.permissions[area] === true;
}

/**
 * Membre dont la personne ne voit que les rendez-vous (collaborateur limité à
 * son agenda), ou null : tout l'agenda.
 */
export function agendaStaffFilter(access: SpaceAccess): string | null {
  if (access.role !== "collaborator" || access.permissions.agendaScope === "all") return null;
  return access.staffMemberId ?? NO_STAFF;
}

/** Droits envoyés par le formulaire de la gérante (cases non cochées : fermé). */
export const permissionsInput = z.object({
  agendaScope: z.enum(["own", "all"]).default("own"),
  customers: z.boolean().default(false),
  stats: z.boolean().default(false),
  site: z.boolean().default(false),
  shop: z.boolean().default(false),
  marketing: z.boolean().default(false),
});

export const inviteInput = z.object({
  staffId: z.uuid(),
  email: z.email().trim().toLowerCase().max(254),
  permissions: permissionsInput,
});

/** Membre d'équipe de l'entreprise de la gérante (jamais celui d'une autre entreprise). */
async function staffOf(tx: Transaction, tenantId: string, businessId: string, staffId: string) {
  const [member] = await tx
    .select({ id: staffMembers.id, name: staffMembers.name })
    .from(staffMembers)
    .where(
      and(
        eq(staffMembers.id, staffId),
        eq(staffMembers.tenantId, tenantId),
        eq(staffMembers.businessId, businessId),
      ),
    );
  if (!member) throw new AppError("not_found");
  return member;
}

/** Accès des membres de l'équipe d'une entreprise (e-mail, droits, dernière connexion). */
export async function listCollaborators(tx: Transaction, tenantId: string, businessId: string) {
  return tx
    .select({
      staffMemberId: memberships.staffMemberId,
      userId: users.id,
      email: users.email,
      lastLoginAt: users.lastLoginAt,
      permissions: memberships.permissions,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.businessId, businessId),
        eq(memberships.role, "collaborator"),
      ),
    );
}

/**
 * Invite un membre de l'équipe : crée son compte s'il n'existe pas, lui donne
 * accès à l'espace avec les droits choisis et lui envoie l'invitation.
 */
export async function inviteCollaborator(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof inviteInput> & { businessId: string; locale: string },
) {
  const input = inviteInput.parse(raw);
  const member = await staffOf(tx, tenantId, raw.businessId, input.staffId);
  const [taken] = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.staffMemberId, member.id)));
  if (taken) throw new AppError("collaborator_already_invited", "email");
  const user = await ensureUser(tx, input.email, member.name);
  // Déjà gérante ou collaborateur de ce site : pas un second accès.
  const [already] = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.tenantId, tenantId)));
  if (already) throw new AppError("collaborator_already_member", "email");
  await tx.insert(memberships).values({
    userId: user.id,
    tenantId,
    businessId: raw.businessId,
    role: "collaborator",
    permissions: input.permissions,
    staffMemberId: member.id,
  });
  await tx.update(staffMembers).set({ userId: user.id }).where(eq(staffMembers.id, member.id));
  await queueMessage(tx, {
    tenantId,
    businessId: raw.businessId,
    template: "collaborator.invite",
    locale: raw.locale,
    data: { userId: user.id },
    dedupeKey: null,
  });
  return { userId: user.id };
}

/** Change les droits d'un collaborateur (pris en compte à sa prochaine page). */
export async function updateCollaborator(
  tx: Transaction,
  tenantId: string,
  raw: { staffId: string; businessId: string; permissions: z.input<typeof permissionsInput> },
) {
  const permissions = permissionsInput.parse(raw.permissions);
  const member = await staffOf(tx, tenantId, raw.businessId, z.uuid().parse(raw.staffId));
  const updated = await tx
    .update(memberships)
    .set({ permissions })
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.staffMemberId, member.id),
        eq(memberships.role, "collaborator"),
      ),
    )
    .returning({ userId: memberships.userId });
  if (updated.length === 0) throw new AppError("not_found");
}

/** Retire l'accès : le compte reste, mais l'espace de ce site ne s'ouvre plus. */
export async function removeCollaborator(
  tx: Transaction,
  tenantId: string,
  raw: { staffId: string; businessId: string },
) {
  const member = await staffOf(tx, tenantId, raw.businessId, z.uuid().parse(raw.staffId));
  const removed = await tx
    .delete(memberships)
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.staffMemberId, member.id),
        eq(memberships.role, "collaborator"),
      ),
    )
    .returning({ userId: memberships.userId });
  if (removed.length === 0) throw new AppError("not_found");
  await tx.update(staffMembers).set({ userId: null }).where(eq(staffMembers.id, member.id));
}

/** Renvoie l'invitation (le collaborateur ne l'a pas reçue ou l'a perdue). */
export async function resendInvitation(
  tx: Transaction,
  tenantId: string,
  raw: { staffId: string; businessId: string; locale: string },
) {
  const member = await staffOf(tx, tenantId, raw.businessId, z.uuid().parse(raw.staffId));
  const [found] = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.staffMemberId, member.id),
        eq(memberships.role, "collaborator"),
      ),
    );
  if (!found) throw new AppError("not_found");
  await queueMessage(tx, {
    tenantId,
    businessId: raw.businessId,
    template: "collaborator.invite",
    locale: raw.locale,
    data: { userId: found.userId },
    dedupeKey: null,
  });
}

/** Accès d'une personne à un site : rôle, droits et membre d'équipe (null : aucun accès). */
export async function membershipOf(tx: Transaction, userId: string, tenantId: string) {
  const [row] = await tx
    .select({
      role: memberships.role,
      businessId: memberships.businessId,
      permissions: memberships.permissions,
      staffMemberId: memberships.staffMemberId,
    })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId)));
  return row ?? null;
}

/** Membre hors de l'agenda du collaborateur (limité au sien) : refusé. */
export function assertStaffInScope(space: SpaceAccess, staffId: string | null | undefined) {
  const own = agendaStaffFilter(space);
  if (own && staffId !== own) throw new AppError("forbidden_area");
}

/** Rendez-vous d'un autre membre, pour un collaborateur limité à son agenda : introuvable. */
export async function assertAppointmentInScope(
  tx: Transaction,
  tenantId: string,
  space: SpaceAccess,
  appointmentId: string,
) {
  const own = agendaStaffFilter(space);
  if (!own) return;
  const [row] = await tx
    .select({ staffId: appointments.staffId })
    .from(appointments)
    .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, appointmentId)));
  if (!row || row.staffId !== own) throw new AppError("not_found");
}

/** Indisponibilité d'un autre membre, ou fermeture de l'établissement : refusée au collaborateur limité. */
export async function assertTimeOffInScope(
  tx: Transaction,
  tenantId: string,
  space: SpaceAccess,
  timeOffId: string,
) {
  const own = agendaStaffFilter(space);
  if (!own) return;
  const [row] = await tx
    .select({ staffId: timeOff.staffId })
    .from(timeOff)
    .where(and(eq(timeOff.tenantId, tenantId), eq(timeOff.id, timeOffId)));
  if (!row) throw new AppError("not_found");
  if (row.staffId !== own) throw new AppError("forbidden_area");
}
