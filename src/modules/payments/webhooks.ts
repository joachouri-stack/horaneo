import { eq, sql } from "drizzle-orm";
import { declareBusiness } from "@/db/access";
import type { Transaction } from "@/db/client";
import { applyGiftCardIntent } from "@/modules/giftcards/giftcards";
import { stripeEvents } from "@/db/schema";
import { applyAccount, disconnectAccount } from "./connect";
import { applyPaymentIntent, businessOfAccount } from "./deposits";
import type { GatewayEvent, GatewayPaymentIntent, GatewayRefund, PaymentGateway } from "./gateway";
import { applyRefund } from "./refunds";

/**
 * Traitement des événements envoyés par Stripe (rôle plateforme).
 * Chaque événement est enregistré avec son identifiant Stripe : reçu deux fois
 * (Stripe renvoie tant qu'il n'a pas de réponse), il n'est traité qu'une fois.
 */

const str = (value: unknown) => (typeof value === "string" ? value : null);
const num = (value: unknown) => (typeof value === "number" ? value : 0);
const meta = (value: unknown) =>
  Object.fromEntries(
    Object.entries((value ?? {}) as Record<string, unknown>).filter(([, item]) => typeof item === "string"),
  ) as Record<string, string>;

function refundFrom(object: Record<string, unknown>): GatewayRefund {
  const intent = object.payment_intent;
  return {
    id: String(object.id),
    status: (str(object.status) ?? "pending") as GatewayRefund["status"],
    amountCents: num(object.amount),
    paymentIntentId: str(intent) ?? str((intent as { id?: unknown } | null)?.id),
    metadata: meta(object.metadata),
  };
}

export type EventOutcome = { outcome: "duplicate" | "ignored" | "processed"; detail?: string };

async function dispatch(tx: Transaction, event: GatewayEvent, gateway: PaymentGateway | null) {
  const object = event.object;
  if (event.type === "account.updated") {
    const tenantId = await applyAccount(tx, {
      id: String(object.id),
      chargesEnabled: Boolean(object.charges_enabled),
      detailsSubmitted: Boolean(object.details_submitted),
    });
    return tenantId ? "account_synced" : "unknown_account";
  }
  if (event.type === "account.application.deauthorized") {
    if (event.account) await disconnectAccount(tx, event.account);
    return "account_disconnected";
  }
  if (!event.account) return "no_account";
  const owner = await businessOfAccount(tx, event.account);
  if (!owner) return "unknown_account";
  const tenantId = owner.tenantId;
  // Site à plusieurs entreprises : les lignes créées (remboursements, messages) sont celles de l'entreprise du compte.
  await declareBusiness(tx, owner.businessId);

  if (event.type.startsWith("payment_intent.")) {
    // Achat d'une carte cadeau (et non un acompte).
    const metadata = (object.metadata ?? {}) as Record<string, string>;
    if (metadata.gift_card_id) {
      return (
        await applyGiftCardIntent(tx, tenantId, {
          id: String(object.id),
          status: String(object.status) as GatewayPaymentIntent["status"],
        })
      ).outcome;
    }
    const result = await applyPaymentIntent(
      tx,
      tenantId,
      { id: String(object.id), status: String(object.status) as GatewayPaymentIntent["status"] },
      gateway,
      { failed: event.type === "payment_intent.payment_failed" },
    );
    return result.outcome;
  }
  if (event.type.startsWith("refund.")) {
    return (await applyRefund(tx, tenantId, refundFrom(object))).outcome;
  }
  return null;
}

/**
 * Traite un événement une seule fois : il est enregistré, verrouillé (une seconde
 * réception simultanée attend), puis marqué comme traité.
 */
export async function processEventOnce(
  tx: Transaction,
  event: Pick<GatewayEvent, "id" | "type" | "account" | "raw">,
  handler: () => Promise<string | null>,
): Promise<EventOutcome> {
  await tx
    .insert(stripeEvents)
    .values({ id: event.id, type: event.type, account: event.account, payload: event.raw as object })
    .onConflictDoNothing();
  const [row] = await tx.select().from(stripeEvents).where(eq(stripeEvents.id, event.id)).for("update");
  if (row?.processedAt) return { outcome: "duplicate" };
  const detail = await handler();
  await tx
    .update(stripeEvents)
    .set({ processedAt: sql`now()`, error: null })
    .where(eq(stripeEvents.id, event.id));
  return detail === null ? { outcome: "ignored" } : { outcome: "processed", detail };
}

export async function handleEvent(
  tx: Transaction,
  event: GatewayEvent,
  gateway: PaymentGateway | null,
): Promise<EventOutcome> {
  return processEventOnce(tx, event, () => dispatch(tx, event, gateway));
}

/** Garde la trace d'un échec (Stripe renverra l'événement plus tard). */
export async function recordEventError(
  tx: Transaction,
  event: Pick<GatewayEvent, "id" | "type" | "account" | "raw">,
  error: unknown,
) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  await tx
    .insert(stripeEvents)
    .values({
      id: event.id,
      type: event.type,
      account: event.account,
      payload: event.raw as object,
      error: message,
    })
    .onConflictDoUpdate({ target: stripeEvents.id, set: { error: message } });
}
