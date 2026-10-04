import { and, desc, eq } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { appointments, payments, tenants, type PlanFeatures } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { getPlatformSetting } from "@/modules/settings";
import type { GatewayPaymentIntent, PaymentGateway } from "./gateway";
import { refundDeposit } from "./refunds";

/**
 * Acomptes payés en ligne par carte (Stripe Connect, paiements directs).
 * Le créneau est retenu pendant le paiement (rendez-vous « pending_payment ») ;
 * il est confirmé dès que le paiement aboutit, que l'information arrive par le
 * navigateur de la cliente ou par l'événement envoyé par Stripe.
 */

type PaymentTenant = {
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
};

/** Le paiement en ligne est-il possible pour cet établissement ? */
export function onlinePaymentReady(
  tenant: PaymentTenant,
  features: PlanFeatures,
  gateway: PaymentGateway | null | undefined,
): gateway is PaymentGateway {
  return Boolean(gateway && features.onlinePayment && tenant.stripeAccountId && tenant.stripeChargesEnabled);
}

export function providerError(error: unknown): never {
  if (error instanceof AppError) throw error;
  console.error("[paiement]", error);
  throw new AppError("payment_provider_error");
}

/** Crée la demande de paiement de l'acompte chez Stripe et l'enregistre. */
export async function createDepositIntent(
  tx: Transaction,
  tenantId: string,
  input: {
    appointmentId: string;
    amountCents: number;
    currency: string;
    accountId: string;
    receiptEmail: string | null;
  },
  gateway: PaymentGateway,
) {
  const commission = await getPlatformSetting(tx, "deposit_commission_percent");
  const applicationFeeCents = Math.max(0, Math.round((input.amountCents * Number(commission || 0)) / 100));
  const intent = await gateway
    .createPaymentIntent({
      accountId: input.accountId,
      amountCents: input.amountCents,
      currency: input.currency,
      applicationFeeCents,
      receiptEmail: input.receiptEmail,
      metadata: { tenant_id: tenantId, appointment_id: input.appointmentId },
      idempotencyKey: `deposit-${input.appointmentId}`,
    })
    .catch(providerError);
  await tx.insert(payments).values({
    tenantId,
    appointmentId: input.appointmentId,
    stripePaymentIntentId: intent.id,
    stripeAccountId: input.accountId,
    amountCents: input.amountCents,
    applicationFeeCents,
    currency: input.currency,
    status: "requires_payment",
  });
  return intent;
}

/** Dernier acompte d'un rendez-vous (avec ses informations de paiement). */
export async function depositOf(tx: Transaction, tenantId: string, appointmentId: string) {
  const [payment] = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.appointmentId, appointmentId)))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  return payment ?? null;
}

function isExclusionViolation(error: unknown) {
  const err = error as { code?: string; cause?: { code?: string } };
  return (err.code ?? err.cause?.code) === "23P01";
}

const STATUS_MAP: Partial<Record<GatewayPaymentIntent["status"], typeof payments.$inferSelect.status>> = {
  succeeded: "succeeded",
  processing: "processing",
  canceled: "canceled",
};

/**
 * Applique l'état d'un paiement reçu de Stripe. Sans effet si rien n'a changé :
 * la même information peut arriver plusieurs fois (navigateur et événement).
 */
export async function applyPaymentIntent(
  tx: Transaction,
  tenantId: string,
  intent: Pick<GatewayPaymentIntent, "id" | "status">,
  gateway: PaymentGateway | null,
  options: { failed?: boolean; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const [payment] = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.stripePaymentIntentId, intent.id)));
  if (!payment) return { outcome: "unknown_payment" as const };

  const next = STATUS_MAP[intent.status] ?? (options.failed ? "failed" : payment.status);
  // Un paiement réussi ne revient jamais en arrière.
  if (payment.status !== "succeeded" && next !== payment.status) {
    await tx.update(payments).set({ status: next }).where(eq(payments.id, payment.id));
  }
  if (intent.status !== "succeeded" || !payment.appointmentId) return { outcome: next };

  const [appointment] = await tx
    .select()
    .from(appointments)
    .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, payment.appointmentId)));
  if (!appointment) return { outcome: "succeeded" as const };

  if (appointment.status === "pending_payment") {
    await tx
      .update(appointments)
      .set({ status: "confirmed", holdExpiresAt: null })
      .where(eq(appointments.id, appointment.id));
    return { outcome: "confirmed" as const, appointmentId: appointment.id };
  }

  if (appointment.status === "expired") {
    // Paiement arrivé après les 10 minutes : le rendez-vous est repris s'il est
    // encore libre, sinon l'acompte est remboursé automatiquement (décision n° 1).
    try {
      await tx.transaction(async (savepoint) => {
        await savepoint
          .update(appointments)
          .set({ status: "confirmed", holdExpiresAt: null })
          .where(eq(appointments.id, appointment.id));
      });
      return { outcome: "confirmed" as const, appointmentId: appointment.id };
    } catch (error) {
      if (!isExclusionViolation(error)) throw error;
      await refundDeposit(tx, tenantId, appointment.id, gateway, { reason: "slot_taken", now });
      return { outcome: "refunded" as const, appointmentId: appointment.id };
    }
  }

  // Paiement arrivé alors que le rendez-vous a déjà été annulé : il est remboursé.
  if (appointment.status === "cancelled") {
    await refundDeposit(tx, tenantId, appointment.id, gateway, { reason: "slot_taken", now });
    return { outcome: "refunded" as const, appointmentId: appointment.id };
  }
  return { outcome: "succeeded" as const, appointmentId: appointment.id };
}

/**
 * Relit l'état du paiement chez Stripe et l'applique (retour de la cliente
 * après le paiement, ou ouverture de son lien de gestion).
 */
export async function syncDeposit(
  tx: Transaction,
  tenantId: string,
  appointmentId: string,
  gateway: PaymentGateway | null,
) {
  const payment = await depositOf(tx, tenantId, appointmentId);
  if (!payment || !gateway || payment.status === "succeeded") return payment;
  const intent = await gateway
    .retrievePaymentIntent(payment.stripeAccountId, payment.stripePaymentIntentId)
    .catch(providerError);
  await applyPaymentIntent(tx, tenantId, intent, gateway);
  return depositOf(tx, tenantId, appointmentId);
}

/** Informations nécessaires au formulaire de carte pour un rendez-vous en attente de paiement. */
export async function depositCheckout(
  tx: Transaction,
  tenantId: string,
  appointmentId: string,
  gateway: PaymentGateway | null,
) {
  const payment = await depositOf(tx, tenantId, appointmentId);
  if (!payment || !gateway || payment.status === "succeeded") return null;
  const intent = await gateway
    .retrievePaymentIntent(payment.stripeAccountId, payment.stripePaymentIntentId)
    .catch(providerError);
  if (!intent.clientSecret || intent.status === "succeeded" || intent.status === "canceled") return null;
  return {
    clientSecret: intent.clientSecret,
    accountId: payment.stripeAccountId,
    publishableKey: gateway.publishableKey,
    amountCents: payment.amountCents,
    currency: payment.currency,
  };
}

/** Le report d'un rendez-vous garde l'acompte (décision n° 7) : il suit le nouveau rendez-vous. */
export async function moveDeposit(tx: Transaction, tenantId: string, fromId: string, toId: string) {
  await tx
    .update(payments)
    .set({ appointmentId: toId })
    .where(and(eq(payments.tenantId, tenantId), eq(payments.appointmentId, fromId)));
}

/** Établissement concerné par un compte Stripe (événements reçus). */
export async function tenantOfAccount(tx: Transaction, accountId: string) {
  const [tenant] = await tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.stripeAccountId, accountId));
  return tenant?.id ?? null;
}
