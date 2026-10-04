import { and, eq } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { businesses, plans, tenants, type PlanFeatures } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { providerError } from "./deposits";
import { statementDescriptor, type GatewayAccount, type PaymentGateway } from "./gateway";

/**
 * Compte Stripe d'une entreprise (Stripe Connect, compte « Standard ») :
 * la gérante l'ouvre depuis son espace, en suivant les étapes guidées de Stripe.
 * Sur un site à plusieurs entreprises, chacune a son propre compte et ne reçoit
 * que les acomptes de ses prestations. Ces fonctions écrivent dans la fiche de
 * l'entreprise : elles s'utilisent avec withPlatform, après vérification des droits.
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

async function loadBusiness(tx: Transaction, tenantId: string, businessId: string) {
  const [row] = await tx
    .select({ business: businesses, tenant: tenants, features: plans.features })
    .from(businesses)
    .innerJoin(tenants, eq(tenants.id, businesses.tenantId))
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(and(eq(businesses.id, businessId), eq(businesses.tenantId, tenantId)));
  if (!row) throw new AppError("not_found");
  return { business: row.business, tenant: row.tenant, features: row.features as PlanFeatures };
}

/**
 * Crée le compte Stripe si besoin, puis renvoie l'adresse des étapes guidées
 * (à usage unique, valable quelques minutes).
 */
export async function startOnboarding(
  tx: Transaction,
  tenantId: string,
  businessId: string,
  gateway: PaymentGateway | null,
  urls: { returnUrl: string; refreshUrl: string },
) {
  if (!gateway) throw new AppError("payments_unavailable");
  const { business, tenant, features } = await loadBusiness(tx, tenantId, businessId);
  if (!features.onlinePayment) throw new AppError("feature_unavailable", "onlinePayment");
  let accountId = business.stripeAccountId;
  if (!accountId) {
    const account = await gateway
      .createAccount({
        country: tenant.country,
        email: business.email ?? tenant.email,
        businessName: business.legalName || business.name,
        // Sur le relevé de la cliente : l'enseigne du site (ce qu'elle connaît).
        statementDescriptor: statementDescriptor(tenant.name),
        metadata: { tenant_id: tenant.id, business_id: business.id },
      })
      .catch(providerError);
    accountId = account.id;
    await tx
      .update(businesses)
      .set({ stripeAccountId: account.id, stripeChargesEnabled: account.chargesEnabled })
      .where(eq(businesses.id, business.id));
  }
  const url = await gateway.createOnboardingLink({ accountId, ...urls }).catch(providerError);
  return { accountId, url };
}

/** Enregistre l'état du compte (retour des étapes guidées, ou événement « account.updated »). */
export async function applyAccount(tx: Transaction, account: GatewayAccount) {
  const updated = await tx
    .update(businesses)
    .set({ stripeChargesEnabled: account.chargesEnabled })
    .where(eq(businesses.stripeAccountId, account.id))
    .returning({ id: businesses.tenantId });
  return updated[0]?.id ?? null;
}

/** Relit l'état du compte chez Stripe. */
export async function refreshAccount(
  tx: Transaction,
  tenantId: string,
  businessId: string,
  gateway: PaymentGateway | null,
) {
  const { business, features } = await loadBusiness(tx, tenantId, businessId);
  if (gateway && business.stripeAccountId) {
    const account = await gateway.retrieveAccount(business.stripeAccountId).catch(providerError);
    await applyAccount(tx, account);
    return connectState({ ...business, stripeChargesEnabled: account.chargesEnabled }, features);
  }
  return connectState(business, features);
}

/** Le professionnel a retiré l'accès de la plateforme à son compte Stripe. */
export async function disconnectAccount(tx: Transaction, accountId: string) {
  await tx
    .update(businesses)
    .set({ stripeChargesEnabled: false })
    .where(eq(businesses.stripeAccountId, accountId));
}
