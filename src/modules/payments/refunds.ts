import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { appointments, customers, payments, refunds } from "@/db/schema";
import { queueMessage } from "@/modules/messages/queue";
import { AppError } from "@/modules/errors";
import type { GatewayRefund, PaymentGateway } from "./gateway";

/**
 * Remboursement des acomptes, toujours sur le compte Stripe du professionnel
 * (paiements directs). Le montant remboursé est enregistré avant l'appel à
 * Stripe ; si Stripe refuse, toute l'opération (annulation comprise) est annulée.
 */

export type RefundReason = "customer_cancelled" | "manager_cancelled" | "slot_taken" | "external";

async function refundedSoFar(tx: Transaction, paymentId: string) {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${refunds.amountCents}), 0)::int` })
    .from(refunds)
    .where(and(eq(refunds.paymentId, paymentId), inArray(refunds.status, ["pending", "succeeded"])));
  return row?.total ?? 0;
}

/** Acompte réussi d'un rendez-vous et montant encore remboursable. */
export async function refundableDeposit(tx: Transaction, tenantId: string, appointmentId: string) {
  const [payment] = await tx
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        eq(payments.appointmentId, appointmentId),
        eq(payments.status, "succeeded"),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(1);
  if (!payment) return null;
  const remainingCents = payment.amountCents - (await refundedSoFar(tx, payment.id));
  return { payment, remainingCents };
}

/**
 * Rembourse ce qui reste de l'acompte d'un rendez-vous.
 * Renvoie null s'il n'y a rien à rembourser (pas d'acompte payé, ou déjà remboursé).
 */
export async function refundDeposit(
  tx: Transaction,
  tenantId: string,
  appointmentId: string,
  gateway: PaymentGateway | null,
  options: { reason: RefundReason; now?: Date },
) {
  const refundable = await refundableDeposit(tx, tenantId, appointmentId);
  if (!refundable || refundable.remainingCents <= 0) return null;
  if (!gateway) throw new AppError("payment_provider_error");
  const { payment, remainingCents } = refundable;
  // Remboursements déjà refusés par Stripe : comptés dans la clé, pour qu'un nouvel essai
  // crée un nouveau remboursement au lieu de retrouver celui qui a échoué.
  const [{ failed }] = await tx
    .select({ failed: sql<number>`count(*)::int` })
    .from(refunds)
    .where(and(eq(refunds.paymentId, payment.id), inArray(refunds.status, ["failed", "canceled"])));

  const [row] = await tx
    .insert(refunds)
    .values({
      tenantId,
      businessId: payment.businessId,
      paymentId: payment.id,
      amountCents: remainingCents,
      reason: options.reason,
    })
    .returning();
  let refund: GatewayRefund;
  try {
    refund = await gateway.createRefund({
      accountId: payment.stripeAccountId,
      paymentIntentId: payment.stripePaymentIntentId,
      amountCents: remainingCents,
      metadata: { tenant_id: tenantId, refund_id: row.id, appointment_id: appointmentId },
      // Clé stable (paiement et montant déjà remboursé) : si la transaction échoue après
      // le remboursement chez Stripe, le nouvel essai retrouve le même remboursement.
      idempotencyKey: `refund-${payment.id}-${payment.amountCents - remainingCents}-${failed}`,
    });
  } catch (error) {
    console.error("[remboursement]", error);
    throw new AppError("payment_provider_error");
  }
  const status = mapRefundStatus(refund.status);
  // Refus immédiat : l'opération (annulation comprise) n'est pas faite, plutôt que d'annoncer
  // à la cliente un remboursement qu'elle ne recevra pas.
  if (status === "failed" || status === "canceled") throw new AppError("payment_provider_error");
  await tx.update(refunds).set({ stripeRefundId: refund.id, status }).where(eq(refunds.id, row.id));
  return { refundId: row.id, amountCents: remainingCents, currency: payment.currency, status };
}

function mapRefundStatus(status: GatewayRefund["status"]): typeof refunds.$inferSelect.status {
  if (status === "succeeded" || status === "failed" || status === "canceled") return status;
  return "pending";
}

/**
 * Met à jour un remboursement d'après Stripe. Un remboursement fait directement
 * depuis le tableau de bord Stripe du professionnel est aussi enregistré.
 */
export async function applyRefund(tx: Transaction, tenantId: string, refund: GatewayRefund) {
  const status = mapRefundStatus(refund.status);
  const [known] = await tx
    .select()
    .from(refunds)
    .where(and(eq(refunds.tenantId, tenantId), eq(refunds.stripeRefundId, refund.id)));
  if (known) {
    if (known.status !== status) {
      await tx.update(refunds).set({ status }).where(eq(refunds.id, known.id));
      if (status === "failed" || status === "canceled") await alertRefundFailed(tx, tenantId, known);
    }
    return { outcome: "updated" as const };
  }
  const ownId = refund.metadata.refund_id;
  if (ownId && /^[0-9a-f-]{36}$/i.test(ownId)) {
    const updated = await tx
      .update(refunds)
      .set({ stripeRefundId: refund.id, status })
      .where(and(eq(refunds.tenantId, tenantId), eq(refunds.id, ownId)))
      .returning();
    if (updated.length > 0) {
      if (status === "failed" || status === "canceled") await alertRefundFailed(tx, tenantId, updated[0]);
      return { outcome: "updated" as const };
    }
  }
  if (!refund.paymentIntentId) return { outcome: "unknown_payment" as const };
  const [payment] = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.stripePaymentIntentId, refund.paymentIntentId)));
  if (!payment) return { outcome: "unknown_payment" as const };
  await tx
    .insert(refunds)
    .values({
      tenantId,
      businessId: payment.businessId,
      paymentId: payment.id,
      stripeRefundId: refund.id,
      amountCents: refund.amountCents,
      reason: "external",
      status,
    })
    .onConflictDoNothing();
  return { outcome: "recorded" as const };
}

/** Remboursement d'acompte refusé par Stripe après coup : la gérante est prévenue. */
async function alertRefundFailed(
  tx: Transaction,
  tenantId: string,
  refund: { id: string; paymentId: string; amountCents: number },
) {
  const [payment] = await tx.select().from(payments).where(eq(payments.id, refund.paymentId));
  if (!payment) return;
  const [customer] = payment.appointmentId
    ? await tx
        .select({ firstName: customers.firstName, lastName: customers.lastName })
        .from(appointments)
        .innerJoin(customers, eq(customers.id, appointments.customerId))
        .where(eq(appointments.id, payment.appointmentId))
    : [];
  await queueMessage(tx, {
    tenantId,
    businessId: payment.businessId,
    template: "manager.refund_failed",
    appointmentId: payment.appointmentId,
    data: {
      kind: "deposit",
      amountCents: refund.amountCents,
      currency: payment.currency,
      customer: customer ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") : "",
    },
    dedupeKey: `manager.refund_failed:${refund.id}`,
  });
}

/** Acompte et remboursements d'un rendez-vous, pour l'affichage. */
export async function depositSummary(tx: Transaction, tenantId: string, appointmentId: string) {
  const [payment] = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.appointmentId, appointmentId)))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  if (!payment) return null;
  const rows = await tx.select().from(refunds).where(eq(refunds.paymentId, payment.id));
  const refundedCents = rows
    .filter((row) => row.status === "succeeded" || row.status === "pending")
    .reduce((sum, row) => sum + row.amountCents, 0);
  return {
    status: payment.status,
    amountCents: payment.amountCents,
    currency: payment.currency,
    refundedCents,
    refundPending: rows.some((row) => row.status === "pending"),
    refundable: payment.status === "succeeded" && refundedCents < payment.amountCents,
  };
}
