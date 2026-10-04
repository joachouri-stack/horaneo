import { eq } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { plans, tenants, type PlanFeatures } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { providerError } from "./deposits";
import { statementDescriptor, type GatewayAccount, type PaymentGateway } from "./gateway";

/**
 * Compte Stripe du professionnel (Stripe Connect, compte « Standard ») :
 * la gérante l'ouvre depuis son espace, en suivant les étapes guidées de Stripe.
 * Ces fonctions écrivent dans la fiche de l'établissement : elles s'utilisent
 * avec withPlatform, après vérification des droits de la gérante.
 */

export type ConnectState = "unavailable" | "not_started" | "incomplete" | "active";

export function connectState(
  tenant: { stripeAccountId: string | null; stripeChargesEnabled: boolean },
  features: PlanFeatures,
): ConnectState {
  if (!features.onlinePayment) return "unavailable";
  if (!tenant.stripeAccountId) return "not_started";
  return tenant.stripeChargesEnabled ? "active" : "incomplete";
}

async function loadTenant(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .select({ tenant: tenants, features: plans.features })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.id, tenantId));
  if (!row) throw new AppError("not_found");
  return { tenant: row.tenant, features: row.features as PlanFeatures };
}

/**
 * Crée le compte Stripe si besoin, puis renvoie l'adresse des étapes guidées
 * (à usage unique, valable quelques minutes).
 */
export async function startOnboarding(
  tx: Transaction,
  tenantId: string,
  gateway: PaymentGateway | null,
  urls: { returnUrl: string; refreshUrl: string },
) {
  if (!gateway) throw new AppError("payments_unavailable");
  const { tenant, features } = await loadTenant(tx, tenantId);
  if (!features.onlinePayment) throw new AppError("feature_unavailable", "onlinePayment");
  let accountId = tenant.stripeAccountId;
  if (!accountId) {
    const account = await gateway
      .createAccount({
        country: tenant.country,
        email: tenant.email,
        businessName: tenant.name,
        statementDescriptor: statementDescriptor(tenant.name),
        metadata: { tenant_id: tenant.id },
      })
      .catch(providerError);
    accountId = account.id;
    await tx
      .update(tenants)
      .set({ stripeAccountId: account.id, stripeChargesEnabled: account.chargesEnabled })
      .where(eq(tenants.id, tenant.id));
  }
  const url = await gateway.createOnboardingLink({ accountId, ...urls }).catch(providerError);
  return { accountId, url };
}

/** Enregistre l'état du compte (retour des étapes guidées, ou événement « account.updated »). */
export async function applyAccount(tx: Transaction, account: GatewayAccount) {
  const updated = await tx
    .update(tenants)
    .set({ stripeChargesEnabled: account.chargesEnabled })
    .where(eq(tenants.stripeAccountId, account.id))
    .returning({ id: tenants.id });
  return updated[0]?.id ?? null;
}

/** Relit l'état du compte chez Stripe. */
export async function refreshAccount(tx: Transaction, tenantId: string, gateway: PaymentGateway | null) {
  const { tenant, features } = await loadTenant(tx, tenantId);
  if (gateway && tenant.stripeAccountId) {
    const account = await gateway.retrieveAccount(tenant.stripeAccountId).catch(providerError);
    await applyAccount(tx, account);
    return connectState({ ...tenant, stripeChargesEnabled: account.chargesEnabled }, features);
  }
  return connectState(tenant, features);
}

/** Le professionnel a retiré l'accès de la plateforme à son compte Stripe. */
export async function disconnectAccount(tx: Transaction, accountId: string) {
  await tx.update(tenants).set({ stripeChargesEnabled: false }).where(eq(tenants.stripeAccountId, accountId));
}
