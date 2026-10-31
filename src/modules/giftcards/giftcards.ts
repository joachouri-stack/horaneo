import { createHash, createHmac, hkdfSync } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { authSecret } from "@/config/env";
import type { Transaction } from "@/db/client";
import { businessSettings, giftCards, giftCardTransactions, type PlanFeatures } from "@/db/schema";
import { loadBookingContext } from "@/modules/booking/availability";
import { addDays, DATE_PATTERN, localToUtc, utcToLocal } from "@/modules/booking/time";
import { AppError } from "@/modules/errors";
import { queueMessage } from "@/modules/messages/queue";
import { parseMoney } from "@/modules/money";
import { onlinePaymentReady, providerError } from "@/modules/payments/deposits";
import type { GatewayPaymentIntent, PaymentGateway } from "@/modules/payments/gateway";

/**
 * Cartes cadeaux. Achetées sur le site, payées directement sur le compte Stripe
 * de l'entreprise (comme un acompte), utilisables chez elle seule : à la
 * réservation en ligne (la carte remplace l'acompte) ou sur place (la gérante
 * saisit le code et déduit le montant). Le solde restant est conservé.
 *
 * Le code est calculé à partir de l'identifiant de la carte et de la clé secrète
 * du serveur (comme le lien de gestion d'un rendez-vous) : il peut être envoyé
 * plus tard sans être stocké en clair ; la base n'en garde que l'empreinte.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Code d'une carte : 12 caractères faciles à lire au téléphone (XXXX-XXXX-XXXX). */
export function giftCardCodeFor(cardId: string): string {
  const key = Buffer.from(hkdfSync("sha256", authSecret(), "gift-card-code", "v1", 32));
  const bytes = createHmac("sha256", key).update(cardId).digest();
  const chars = Array.from(bytes.subarray(0, 12), (byte) => ALPHABET[byte % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/** Code tel que saisi (espaces, tirets, minuscules) → forme canonique. */
export function normalizeGiftCardCode(input: string): string {
  const chars = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return chars.length === 12 ? `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}` : chars;
}

export function hashGiftCardCode(code: string): string {
  return createHash("sha256").update(normalizeGiftCardCode(code)).digest("hex");
}

export type GiftCardRow = typeof giftCards.$inferSelect;
export type GiftCardState = "pending_payment" | "active" | "used" | "expired" | "cancelled";

/** État affiché : « utilisée » et « expirée » se déduisent du solde et de la date. */
export function giftCardState(
  card: Pick<GiftCardRow, "status" | "balanceCents" | "expiresAt">,
  now = new Date(),
): GiftCardState {
  if (card.status !== "active") return card.status;
  if (card.balanceCents <= 0) return "used";
  if (card.expiresAt <= now) return "expired";
  return "active";
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

// ─── Achat en ligne ───────────────────────────────────────────────────────────

export const purchaseInput = z.object({
  /** Montant choisi : « 50 » ou « 42,50 » (euros). */
  amount: z.string().trim().min(1),
  purchaserName: z.string().trim().min(2).max(80),
  purchaserEmail: z.email().trim().toLowerCase(),
  recipientName: z.string().trim().max(80).optional(),
  recipientEmail: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((value) => value || undefined)
    .pipe(z.email().optional()),
  message: z.string().trim().max(500).optional(),
  /** Date d'envoi (vide : tout de suite). */
  sendOn: z
    .string()
    .optional()
    .transform((value) => value || undefined)
    .pipe(z.string().regex(DATE_PATTERN).optional()),
  locale: z.string().min(2).max(5).default("fr"),
});

/** Réglages des cartes de l'entreprise déclarée, et possibilité de les vendre. */
export async function giftCardOffer(tx: Transaction, tenantId: string, gateway: PaymentGateway | null) {
  const context = await loadBookingContext(tx, tenantId);
  const features = context.features as PlanFeatures;
  const { settings } = context;
  const available =
    Boolean(features.giftCards) &&
    settings.giftCardsEnabled &&
    context.tenant.status === "active" &&
    onlinePaymentReady(context.business, context.features, gateway);
  return {
    available,
    business: context.business,
    tenant: context.tenant,
    amounts: settings.giftCardAmounts,
    minCents: settings.giftCardMinCents,
    maxCents: settings.giftCardMaxCents,
    validityMonths: settings.giftCardValidityMonths,
  };
}

/**
 * Crée la carte (en attente de paiement) et le paiement sur le compte Stripe de
 * l'entreprise. La carte n'est active qu'une fois le paiement confirmé.
 */
export async function startGiftCardPurchase(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof purchaseInput>,
  gateway: PaymentGateway | null,
  now = new Date(),
) {
  const input = purchaseInput.parse(raw);
  const offer = await giftCardOffer(tx, tenantId, gateway);
  if (!offer.available || !gateway || !offer.business.stripeAccountId)
    throw new AppError("gift_cards_unavailable");
  const amountCents = parseMoney(input.amount);
  if (!Number.isInteger(amountCents) || amountCents < offer.minCents || amountCents > offer.maxCents) {
    throw new AppError("gift_card_amount", "amount");
  }
  const timezone = offer.tenant.timezone;
  const today = utcToLocal(now, timezone).date;
  // Date d'envoi : entre aujourd'hui et dans un an, et qui existe (pas de 31 février).
  if (
    input.sendOn &&
    (input.sendOn < today || input.sendOn > addDays(today, 365) || addDays(input.sendOn, 0) !== input.sendOn)
  )
    throw new AppError("invalid", "sendOn");
  // Envoi programmé : 9 h le jour choisi (heure de l'établissement) ; sinon tout de suite.
  const sendAt = input.sendOn && input.sendOn > today ? localToUtc(input.sendOn, "09:00", timezone) : now;
  const id = crypto.randomUUID();
  const code = giftCardCodeFor(id);
  const [card] = await tx
    .insert(giftCards)
    .values({
      id,
      tenantId,
      codeHash: hashGiftCardCode(code),
      codeLast4: code.slice(-4),
      status: "pending_payment",
      initialCents: amountCents,
      balanceCents: amountCents,
      currency: offer.tenant.currency,
      purchaserName: input.purchaserName,
      purchaserEmail: input.purchaserEmail,
      recipientName: input.recipientName || null,
      recipientEmail: input.recipientEmail ?? null,
      message: input.message || null,
      sendAt,
      expiresAt: addMonths(sendAt, offer.validityMonths),
      stripeAccountId: offer.business.stripeAccountId,
      locale: input.locale,
    })
    .returning();
  const intent = await gateway
    .createPaymentIntent({
      accountId: offer.business.stripeAccountId,
      amountCents,
      currency: offer.tenant.currency,
      applicationFeeCents: 0,
      receiptEmail: input.purchaserEmail,
      metadata: { tenant_id: tenantId, business_id: offer.business.id, gift_card_id: card.id },
      idempotencyKey: `gift-card-${card.id}`,
    })
    .catch(providerError);
  if (!intent.clientSecret) throw new AppError("payment_provider_error");
  await tx.update(giftCards).set({ stripePaymentIntentId: intent.id }).where(eq(giftCards.id, card.id));
  return {
    giftCardId: card.id,
    amountCents,
    currency: card.currency,
    payment: {
      clientSecret: intent.clientSecret,
      accountId: offer.business.stripeAccountId,
      publishableKey: gateway.publishableKey,
    },
  };
}

/**
 * Paiement confirmé (retour du navigateur ou événement Stripe) : la carte devient
 * active, et les messages partent (la carte à la date choisie). Sans effet si
 * elle l'est déjà : l'appeler deux fois ne renvoie jamais deux cartes.
 */
export async function applyGiftCardIntent(
  tx: Transaction,
  tenantId: string,
  intent: Pick<GatewayPaymentIntent, "id" | "status">,
  now = new Date(),
) {
  const [card] = await tx
    .select()
    .from(giftCards)
    .where(and(eq(giftCards.tenantId, tenantId), eq(giftCards.stripePaymentIntentId, intent.id)))
    .for("update");
  if (!card) return { outcome: "unknown_gift_card" as const };
  if (intent.status !== "succeeded") return { outcome: "pending" as const };
  if (card.status !== "pending_payment") return { outcome: "already_active" as const, giftCardId: card.id };
  await tx.update(giftCards).set({ status: "active", paidAt: now }).where(eq(giftCards.id, card.id));
  await tx.insert(giftCardTransactions).values({
    tenantId,
    businessId: card.businessId,
    giftCardId: card.id,
    kind: "purchase",
    amountCents: card.initialCents,
  });
  const data = { giftCardId: card.id };
  await queueMessage(tx, {
    tenantId,
    businessId: card.businessId,
    template: "customer.gift_card",
    locale: card.locale,
    data,
    dedupeKey: `customer.gift_card:${card.id}`,
    sendAt: card.sendAt > now ? card.sendAt : undefined,
  });
  await queueMessage(tx, {
    tenantId,
    businessId: card.businessId,
    template: "customer.gift_card_receipt",
    locale: card.locale,
    data,
    dedupeKey: `customer.gift_card_receipt:${card.id}`,
  });
  await queueMessage(tx, {
    tenantId,
    businessId: card.businessId,
    template: "manager.gift_card_sold",
    data,
    dedupeKey: `manager.gift_card_sold:${card.id}`,
  });
  return { outcome: "activated" as const, giftCardId: card.id };
}

/** Après le paiement dans le navigateur : relit le paiement chez Stripe. */
export async function syncGiftCardPayment(
  tx: Transaction,
  tenantId: string,
  giftCardId: string,
  gateway: PaymentGateway | null,
) {
  const [card] = await tx
    .select()
    .from(giftCards)
    .where(and(eq(giftCards.tenantId, tenantId), eq(giftCards.id, giftCardId)));
  if (!card) throw new AppError("not_found");
  if (card.status === "pending_payment" && gateway && card.stripePaymentIntentId && card.stripeAccountId) {
    const intent = await gateway
      .retrievePaymentIntent(card.stripeAccountId, card.stripePaymentIntentId)
      .catch(providerError);
    await applyGiftCardIntent(tx, tenantId, intent);
  }
  const [after] = await tx.select().from(giftCards).where(eq(giftCards.id, giftCardId));
  return after;
}

// ─── Utilisation ──────────────────────────────────────────────────────────────

/** Carte de l'entreprise déclarée, retrouvée par son code (sinon : inconnue). */
export async function findGiftCard(tx: Transaction, tenantId: string, code: string) {
  const [card] = await tx
    .select()
    .from(giftCards)
    .where(and(eq(giftCards.tenantId, tenantId), eq(giftCards.codeHash, hashGiftCardCode(code))));
  return card ?? null;
}

function assertUsable(card: GiftCardRow | null, now: Date): asserts card is GiftCardRow {
  if (!card || card.status === "pending_payment" || card.status === "cancelled") {
    throw new AppError("gift_card_not_found", "giftCardCode");
  }
  const state = giftCardState(card, now);
  if (state === "expired") throw new AppError("gift_card_expired", "giftCardCode");
  if (state === "used") throw new AppError("gift_card_used", "giftCardCode");
}

/** Débit d'une carte (verrouillée pendant l'opération : deux utilisations simultanées ne la font jamais passer sous zéro). */
async function debit(
  tx: Transaction,
  tenantId: string,
  card: GiftCardRow,
  amountCents: number,
  details: {
    kind: "redeem_online" | "redeem_on_site";
    appointmentId?: string;
    userId?: string;
    note?: string;
  },
) {
  const [updated] = await tx
    .update(giftCards)
    .set({ balanceCents: sql`${giftCards.balanceCents} - ${amountCents}` })
    .where(and(eq(giftCards.id, card.id), sql`${giftCards.balanceCents} >= ${amountCents}`))
    .returning();
  if (!updated) throw new AppError("gift_card_insufficient", "amount");
  await tx.insert(giftCardTransactions).values({
    tenantId,
    businessId: card.businessId,
    giftCardId: card.id,
    kind: details.kind,
    amountCents: -amountCents,
    appointmentId: details.appointmentId ?? null,
    createdByUserId: details.userId ?? null,
    note: details.note || null,
  });
  return updated;
}

/** Vérifie une carte avant la réservation (rien n'est débité). */
export async function checkGiftCard(
  tx: Transaction,
  tenantId: string,
  code: string,
  depositCents: number,
  now = new Date(),
) {
  const card = await findGiftCard(tx, tenantId, code);
  assertUsable(card, now);
  if (card.balanceCents < depositCents) throw new AppError("gift_card_insufficient", "giftCardCode");
  return { balanceCents: card.balanceCents, currency: card.currency, codeLast4: card.codeLast4 };
}

/**
 * Réservation en ligne avec une carte : elle remplace l'acompte (débité de la
 * carte, sans paiement par carte bancaire). Sans acompte demandé, la carte est
 * simplement rattachée au rendez-vous ; le soin se déduit sur place.
 */
export async function redeemForBooking(
  tx: Transaction,
  tenantId: string,
  code: string,
  appointmentId: string,
  depositCents: number,
  now = new Date(),
) {
  const card = await findGiftCard(tx, tenantId, code);
  assertUsable(card, now);
  if (card.balanceCents < depositCents) throw new AppError("gift_card_insufficient", "giftCardCode");
  return debit(tx, tenantId, card, depositCents, { kind: "redeem_online", appointmentId });
}

export const redeemInput = z.object({
  code: z.string().trim().min(4).max(40),
  amount: z.string().trim().min(1),
  note: z.string().trim().max(200).optional(),
});

/** Sur place : la gérante saisit le code et le montant du soin ; le solde est conservé. */
export async function redeemOnSite(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof redeemInput>,
  userId: string | null,
  now = new Date(),
) {
  const input = redeemInput.parse(raw);
  const amountCents = parseMoney(input.amount);
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new AppError("invalid", "amount");
  const card = await findGiftCard(tx, tenantId, input.code);
  assertUsable(card, now);
  const updated = await debit(tx, tenantId, card, amountCents, {
    kind: "redeem_on_site",
    userId: userId ?? undefined,
    note: input.note,
  });
  return { balanceCents: updated.balanceCents, currency: updated.currency, codeLast4: updated.codeLast4 };
}

/**
 * Annulation dans le délai d'un rendez-vous réglé avec une carte : le montant
 * pris sur la carte y est remis (comme un acompte remboursé). Sans effet sinon.
 */
export async function creditBackForAppointment(tx: Transaction, tenantId: string, appointmentId: string) {
  const rows = await tx
    .select()
    .from(giftCardTransactions)
    .where(
      and(eq(giftCardTransactions.tenantId, tenantId), eq(giftCardTransactions.appointmentId, appointmentId)),
    );
  const byCard = new Map<string, number>();
  for (const row of rows) byCard.set(row.giftCardId, (byCard.get(row.giftCardId) ?? 0) + row.amountCents);
  let credited = 0;
  for (const [giftCardId, net] of byCard) {
    if (net >= 0) continue;
    const amount = -net;
    const [card] = await tx
      .update(giftCards)
      .set({ balanceCents: sql`least(${giftCards.initialCents}, ${giftCards.balanceCents} + ${amount})` })
      .where(eq(giftCards.id, giftCardId))
      .returning();
    if (!card) continue;
    await tx.insert(giftCardTransactions).values({
      tenantId,
      businessId: card.businessId,
      giftCardId,
      kind: "credit_back",
      amountCents: amount,
      appointmentId,
    });
    credited += amount;
  }
  return credited;
}

/** Rendez-vous déplacé : ce qui a été pris sur la carte suit le nouveau rendez-vous. */
export async function moveGiftCardRedemption(
  tx: Transaction,
  tenantId: string,
  fromId: string,
  toId: string,
) {
  const rows = await tx
    .select()
    .from(giftCardTransactions)
    .where(and(eq(giftCardTransactions.tenantId, tenantId), eq(giftCardTransactions.appointmentId, fromId)));
  const byCard = new Map<string, { net: number; businessId: string }>();
  for (const row of rows) {
    const entry = byCard.get(row.giftCardId) ?? { net: 0, businessId: row.businessId };
    entry.net += row.amountCents;
    byCard.set(row.giftCardId, entry);
  }
  for (const [giftCardId, { net, businessId }] of byCard) {
    if (net >= 0) continue;
    await tx.insert(giftCardTransactions).values([
      { tenantId, businessId, giftCardId, kind: "credit_back", amountCents: -net, appointmentId: fromId },
      { tenantId, businessId, giftCardId, kind: "redeem_online", amountCents: net, appointmentId: toId },
    ]);
  }
}

// ─── Liste (gérante) ──────────────────────────────────────────────────────────

/**
 * L'entreprise a encore des cartes utilisables. Une carte déjà vendue reste
 * valable même si le pack ne permet plus d'en vendre (changement de pack) :
 * elle s'utilise en ligne et s'encaisse sur place jusqu'à son expiration.
 */
export async function hasUsableGiftCards(tx: Transaction, tenantId: string, now = new Date()) {
  const [row] = await tx
    .select({ id: giftCards.id })
    .from(giftCards)
    .where(
      and(
        eq(giftCards.tenantId, tenantId),
        eq(giftCards.status, "active"),
        gt(giftCards.balanceCents, 0),
        gt(giftCards.expiresAt, now),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function listGiftCards(tx: Transaction, tenantId: string, now = new Date()) {
  const rows = await tx
    .select()
    .from(giftCards)
    .where(and(eq(giftCards.tenantId, tenantId), sql`${giftCards.status} <> 'pending_payment'`))
    .orderBy(desc(giftCards.createdAt))
    .limit(500);
  return rows.map((card) => ({ ...card, state: giftCardState(card, now) }));
}

export async function giftCardHistory(tx: Transaction, tenantId: string, giftCardId: string) {
  return tx
    .select()
    .from(giftCardTransactions)
    .where(and(eq(giftCardTransactions.tenantId, tenantId), eq(giftCardTransactions.giftCardId, giftCardId)))
    .orderBy(desc(giftCardTransactions.createdAt));
}

// ─── Réglages (gérante) ───────────────────────────────────────────────────────

export const giftCardSettingsInput = z.object({
  enabled: z.boolean(),
  validityMonths: z.coerce.number().int().min(1).max(60),
  /** « 30, 50, 100 » (euros). */
  amounts: z.string().trim().max(100),
  min: z.string().trim().min(1),
  max: z.string().trim().min(1),
});

/** Cartes proposées ou non, durée de validité, montants (entreprise déclarée). */
export async function updateGiftCardSettings(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof giftCardSettingsInput>,
) {
  const input = giftCardSettingsInput.parse(raw);
  const amounts = input.amounts
    .split(/[;,\s]+/)
    .filter(Boolean)
    .map(parseMoney);
  const minCents = parseMoney(input.min);
  const maxCents = parseMoney(input.max);
  if (!Number.isInteger(minCents) || !Number.isInteger(maxCents) || minCents <= 0 || minCents > maxCents) {
    throw new AppError("invalid", "min");
  }
  if (
    amounts.length === 0 ||
    amounts.length > 6 ||
    amounts.some((value) => !Number.isInteger(value) || value < minCents || value > maxCents)
  ) {
    throw new AppError("invalid", "amounts");
  }
  const context = await loadBookingContext(tx, tenantId);
  if (!context.features.giftCards) throw new AppError("feature_unavailable", "giftCards");
  await tx
    .update(businessSettings)
    .set({
      giftCardsEnabled: input.enabled,
      giftCardValidityMonths: input.validityMonths,
      giftCardAmounts: [...new Set(amounts)].sort((a, b) => a - b),
      giftCardMinCents: minCents,
      giftCardMaxCents: maxCents,
    })
    .where(eq(businessSettings.businessId, context.business.id));
}
