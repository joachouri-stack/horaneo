import { tenantFeatures } from "@/modules/billing/entitlements";
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import {
  appointmentItems,
  appointments,
  businessSettings,
  businesses,
  customerDataRequests,
  customers,
  giftCards,
  plans,
  services,
  staffMembers,
  tenants,
  type PlanFeatures,
} from "@/db/schema";
import { pickLocalized, type Locale } from "@/i18n/locales";
import { assignManageToken, manageTokenFor } from "@/modules/booking/create";
import { addMinutes } from "@/modules/booking/time";
import { anonymizeCustomer, birthdayInput } from "@/modules/customers/customers";
import { AppError } from "@/modules/errors";
import { giftCardCodeFor } from "@/modules/giftcards/giftcards";
import { customerLoyalty } from "@/modules/loyalty/loyalty";
import { queueMessage } from "@/modules/messages/queue";
import { depositSummary } from "@/modules/payments/refunds";
import type { CustomerIdentity } from "./auth";

/**
 * Contenu de l'espace d'une cliente chez UNE entreprise (déclarée par
 * l'appelant) : ses fiches (même e-mail ou même téléphone, exactement), ses
 * rendez-vous, et selon le pack ses cartes cadeaux et sa fidélité. Les règles
 * de la base empêchent de lire les données d'une autre entreprise.
 */

/** Fonctions de l'espace incluses dans le pack du site. */
export async function customerSpaceFeatures(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .select({ features: tenantFeatures })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.id, tenantId));
  const features = (row?.features ?? {}) as PlanFeatures;
  return {
    space: Boolean(features.customerSpace),
    giftCards: Boolean(features.customerSpace && features.giftCards),
    loyalty: Boolean(features.customerSpace && features.loyalty),
  };
}

function matches(identity: CustomerIdentity) {
  return identity.channel === "email"
    ? sql`lower(${customers.email}) = ${identity.identifier}`
    : eq(customers.phone, identity.identifier);
}

/** Fiches de la cliente dans l'entreprise déclarée. */
export async function matchingCustomers(tx: Transaction, tenantId: string, identity: CustomerIdentity) {
  return tx
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), matches(identity)))
    .orderBy(desc(customers.updatedAt));
}

export async function loadBusinessSpace(
  tx: Transaction,
  tenantId: string,
  businessId: string,
  identity: CustomerIdentity,
  options: { now?: Date; locale: Locale },
) {
  const now = options.now ?? new Date();
  const features = await customerSpaceFeatures(tx, tenantId);
  if (!features.space) throw new AppError("customer_space_unavailable");
  const [business] = await tx
    .select({ name: businesses.name, deadlineHours: businessSettings.cancellationDeadlineHours })
    .from(businesses)
    .innerJoin(businessSettings, eq(businessSettings.businessId, businesses.id))
    .where(and(eq(businesses.tenantId, tenantId), eq(businesses.id, businessId)));
  if (!business) throw new AppError("not_found");
  const owners = await matchingCustomers(tx, tenantId, identity);
  const customerIds = owners.map((row) => row.id);

  const rows = customerIds.length
    ? await tx
        .select({
          appointment: appointments,
          staffName: staffMembers.name,
          staffActive: staffMembers.isActive,
        })
        .from(appointments)
        .innerJoin(staffMembers, eq(staffMembers.id, appointments.staffId))
        .where(
          and(
            inArray(appointments.customerId, customerIds),
            inArray(appointments.status, ["confirmed", "attended", "no_show"]),
          ),
        )
        .orderBy(desc(appointments.startsAt))
        .limit(200)
    : [];
  const items = rows.length
    ? await tx
        .select({
          appointmentId: appointmentItems.appointmentId,
          serviceId: appointmentItems.serviceId,
          name: appointmentItems.serviceName,
          durationMinutes: appointmentItems.durationMinutes,
        })
        .from(appointmentItems)
        .where(
          inArray(
            appointmentItems.appointmentId,
            rows.map((row) => row.appointment.id),
          ),
        )
        .orderBy(asc(appointmentItems.position))
    : [];
  // « Reprendre ce soin » : la prestation doit encore être proposée en ligne.
  const serviceIds = [...new Set(items.map((item) => item.serviceId).filter((id): id is string => !!id))];
  const bookable = new Set(
    serviceIds.length
      ? (
          await tx
            .select({ id: services.id })
            .from(services)
            .where(
              and(
                inArray(services.id, serviceIds),
                eq(services.isActive, true),
                eq(services.isOnlineBookable, true),
              ),
            )
        ).map((row) => row.id)
      : [],
  );

  const upcoming = [];
  const past = [];
  for (const { appointment: a, staffName, staffActive } of rows) {
    const own = items.filter((item) => item.appointmentId === a.id);
    const base = {
      id: a.id,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      status: a.status,
      staffName,
      beneficiaryName: a.beneficiaryName,
      services: own.map((item) => pickLocalized(item.name, options.locale)),
      /** Durée de chaque prestation (même ordre que services) : affichée à côté du nom. */
      durations: own.map((item) => item.durationMinutes),
      currency: a.currency,
    };
    if (a.status === "confirmed" && a.endsAt > now) {
      const deadline = addMinutes(a.startsAt, -business.deadlineHours * 60);
      const deposit = await depositSummary(tx, tenantId, a.id);
      upcoming.push({
        ...base,
        depositPaidCents: deposit?.status === "succeeded" ? deposit.amountCents - deposit.refundedCents : 0,
        canModify: now <= deadline,
        deadline,
        // Lien « déplacer / annuler » (le même que dans les e-mails), créé s'il manque.
        manageToken: a.manageTokenHash ? manageTokenFor(a.id) : await assignManageToken(tx, a.id),
      });
    } else if (a.startsAt <= now) {
      const first = own[0]?.serviceId ?? null;
      past.push({
        ...base,
        rebook:
          first && bookable.has(first) ? { serviceId: first, staffId: staffActive ? a.staffId : null } : null,
      });
    }
  }
  upcoming.reverse();

  const cards =
    features.giftCards && identity.channel === "email"
      ? (
          await tx
            .select()
            .from(giftCards)
            .where(
              and(
                eq(giftCards.tenantId, tenantId),
                eq(giftCards.status, "active"),
                gt(giftCards.balanceCents, 0),
                gt(giftCards.expiresAt, now),
                or(
                  sql`lower(${giftCards.purchaserEmail}) = ${identity.identifier}`,
                  sql`lower(${giftCards.recipientEmail}) = ${identity.identifier}`,
                ),
              ),
            )
            .orderBy(asc(giftCards.expiresAt))
        ).map((card) => {
          // Le code n'est montré qu'à la personne qui reçoit la carte (l'acheteuse si elle
          // se l'est offerte), et seulement une fois la carte envoyée : une carte offerte
          // reste une surprise, et l'acheteuse ne peut pas l'utiliser à la place.
          const recipient = card.recipientEmail?.toLowerCase() ?? card.purchaserEmail.toLowerCase();
          const received = recipient === identity.identifier;
          const sent = card.sendAt <= now;
          return {
            id: card.id,
            code: received && sent ? giftCardCodeFor(card.id) : null,
            balanceCents: card.balanceCents,
            currency: card.currency,
            expiresAt: card.expiresAt,
            received,
            recipientName: received ? null : card.recipientName,
            sendAt: card.sendAt,
          };
        })
      : null;

  // Fidélité : compteur si le pack l'inclut ; sinon, seulement un bon déjà gagné encore valable.
  const loyalty = await customerLoyalty(tx, tenantId, customerIds, now);
  const pending = customerIds.length
    ? await tx
        .select({ kind: customerDataRequests.kind })
        .from(customerDataRequests)
        .where(
          and(inArray(customerDataRequests.customerId, customerIds), eq(customerDataRequests.status, "new")),
        )
    : [];
  const contact = owners[0] ?? null;
  // La cliente peut toujours donner ou changer sa date (facultative).
  const dated = owners.find((row) => row.birthMonth !== null);

  return {
    businessId,
    businessName: business.name,
    customerIds,
    contact: contact
      ? {
          firstName: contact.firstName,
          lastName: contact.lastName ?? "",
          email: contact.email ?? "",
          phone: contact.phone ?? "",
        }
      : null,
    birthday: { month: dated?.birthMonth ?? null, day: dated?.birthDay ?? null },
    upcoming,
    past,
    giftCards: cards,
    loyalty,
    pendingRequests: [...new Set(pending.map((row) => row.kind))],
  };
}

export type BusinessSpace = Awaited<ReturnType<typeof loadBusinessSpace>>;

/** Coordonnées connues pour préremplir la réservation (« Reprendre ce soin »). */
export async function contactForBooking(tx: Transaction, tenantId: string, identity: CustomerIdentity) {
  const [contact] = await matchingCustomers(tx, tenantId, identity);
  return contact
    ? {
        firstName: contact.firstName,
        lastName: contact.lastName ?? "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
      }
    : null;
}

/**
 * Anniversaire donné (ou changé, ou effacé) par la cliente connectée, sur ses
 * fiches de l'entreprise déclarée. Toujours possible : la date est facultative.
 */
export async function setCustomerBirthday(
  tx: Transaction,
  tenantId: string,
  identity: CustomerIdentity,
  raw: { birthMonth?: unknown; birthDay?: unknown },
) {
  const birthday = birthdayInput.parse(raw);
  const updated = await tx
    .update(customers)
    .set(birthday)
    .where(and(eq(customers.tenantId, tenantId), matches(identity), isNull(customers.anonymizedAt)))
    .returning({ id: customers.id });
  if (updated.length === 0) throw new AppError("not_found");
  return birthday;
}

/**
 * Demande d'export ou de suppression des données, adressée à l'entreprise
 * déclarée (une par entreprise). Une demande déjà en cours n'est pas dupliquée.
 */
export async function requestDataAction(
  tx: Transaction,
  tenantId: string,
  identity: CustomerIdentity,
  kind: "export" | "deletion",
) {
  const owners = await matchingCustomers(tx, tenantId, identity);
  if (owners.length === 0) return { created: 0 };
  const ids = owners.map((row) => row.id);
  const [open] = await tx
    .select({ id: customerDataRequests.id })
    .from(customerDataRequests)
    .where(
      and(
        inArray(customerDataRequests.customerId, ids),
        eq(customerDataRequests.kind, kind),
        eq(customerDataRequests.status, "new"),
      ),
    );
  if (open) return { created: 0 };
  const [request] = await tx
    .insert(customerDataRequests)
    .values({ tenantId, businessId: owners[0].businessId, customerId: owners[0].id, kind })
    .returning();
  await queueMessage(tx, {
    tenantId,
    businessId: owners[0].businessId,
    template: "manager.data_request",
    data: {
      kind,
      requestId: request.id,
      customerName: [owners[0].firstName, owners[0].lastName].filter(Boolean).join(" "),
    },
    dedupeKey: `manager.data_request:${request.id}`,
  });
  return { created: 1 };
}

/** Demandes de données reçues par l'entreprise (espace gérante). */
export async function listDataRequests(tx: Transaction, tenantId: string) {
  return tx
    .select({
      request: customerDataRequests,
      firstName: customers.firstName,
      lastName: customers.lastName,
      email: customers.email,
      phone: customers.phone,
    })
    .from(customerDataRequests)
    .innerJoin(customers, eq(customers.id, customerDataRequests.customerId))
    .where(eq(customerDataRequests.tenantId, tenantId))
    .orderBy(sql`${customerDataRequests.status} = 'new' desc`, desc(customerDataRequests.createdAt))
    .limit(200);
}

/**
 * Clôt une demande de données. Une demande de suppression marquée « traitée »
 * efface aussitôt les données de la cliente (`erasedName` : nom affiché à la place).
 */
export async function resolveDataRequest(
  tx: Transaction,
  tenantId: string,
  requestId: string,
  status: "done" | "rejected",
  userId: string | null,
  erasedName: string,
  now = new Date(),
) {
  const [updated] = await tx
    .update(customerDataRequests)
    .set({ status, resolvedAt: now, resolvedByUserId: userId })
    .where(
      and(
        eq(customerDataRequests.id, requestId),
        eq(customerDataRequests.tenantId, tenantId),
        isNull(customerDataRequests.resolvedAt),
      ),
    )
    .returning();
  if (!updated) throw new AppError("not_found");
  if (status === "done" && updated.kind === "deletion") {
    await anonymizeCustomer(tx, tenantId, updated.customerId, erasedName, now);
  }
  return updated;
}
