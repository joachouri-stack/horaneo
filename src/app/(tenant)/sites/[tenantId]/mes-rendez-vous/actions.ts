"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { withTenant } from "@/db/access";
import { toActionError, type ActionResult } from "@/lib/actions/result";
import { sendQueuedSoon } from "@/lib/jobs/tick";
import {
  clearCustomerCookie,
  customerSession,
  customerSessionToken,
  setCustomerCookie,
} from "@/lib/site/customer-session";
import { currentSiteTenant, publicLimits } from "@/lib/site/current";
import { getSite } from "@/lib/site/load";
import {
  closeSession,
  issueLoginCode,
  knownBusinesses,
  parseIdentifier,
  signInWithCode,
  signInWithLink,
  smsLoginAvailable,
} from "@/modules/customer-space/auth";
import { customerSpaceFeatures, requestDataAction } from "@/modules/customer-space/space";
import { AppError } from "@/modules/errors";
import { SITE_PATHS } from "@/modules/site/paths";
import { currentPeriod } from "@/modules/tenants/queries";

/**
 * Espace des clientes : demande d'un lien (e-mail) ou d'un code (SMS), connexion,
 * déconnexion. La réponse est la même que l'adresse soit connue ou non.
 */

type Previous = ActionResult<unknown> | null;

async function siteWithSpace() {
  const site = await currentSiteTenant();
  const features = await withTenant(
    site.tenantId,
    (tx) => customerSpaceFeatures(tx, site.tenantId),
    undefined,
    null,
  );
  if (!features.space) throw new AppError("customer_space_unavailable");
  return site;
}

export async function requestLoginAction(
  _previous: Previous,
  data: FormData,
): Promise<ActionResult<{ channel: "email" | "sms"; identifier: string }>> {
  try {
    const { tenantId, ip } = await siteWithSpace();
    if (!publicLimits.customerLogin.attempt(`${tenantId}:${ip}`)) throw new AppError("rate_limited");
    const site = await getSite(tenantId);
    const identity = parseIdentifier(String(data.get("identifier") ?? ""), site.tenant.country);
    const smsOk =
      identity.channel === "email" ||
      (await withTenant(
        tenantId,
        (tx) => smsLoginAvailable(tx, tenantId, currentPeriod(site.tenant.timezone)),
        undefined,
        null,
      ));
    if (!smsOk) throw new AppError("sms_unavailable", "identifier");
    // Au-delà de la limite, ou adresse inconnue : rien n'est envoyé, mais la réponse est identique.
    if (publicLimits.customerIdentifier.attempt(`${tenantId}:${identity.identifier}`)) {
      const known = await withTenant(
        tenantId,
        (tx) => knownBusinesses(tx, tenantId, identity),
        undefined,
        null,
      );
      if (known.length > 0) {
        await withTenant(
          tenantId,
          (tx) => issueLoginCode(tx, tenantId, identity, { businessId: known[0], locale: site.locale }),
          undefined,
          known[0],
        );
        sendQueuedSoon();
      }
    }
    return { ok: true, data: identity };
  } catch (error) {
    return toActionError(error);
  }
}

export async function verifyCodeAction(_previous: Previous, data: FormData): Promise<ActionResult> {
  try {
    const { tenantId, ip } = await siteWithSpace();
    if (!publicLimits.customerCode.attempt(`${tenantId}:${ip}`)) throw new AppError("rate_limited");
    const phone = z
      .string()
      .regex(/^\+[1-9][0-9]{6,14}$/)
      .parse(data.get("phone"));
    const token = await withTenant(
      tenantId,
      (tx) => signInWithCode(tx, tenantId, phone, String(data.get("code") ?? "")),
      undefined,
      null,
    );
    if (!token) throw new AppError("login_invalid", "code");
    await setCustomerCookie(token);
  } catch (error) {
    return toActionError(error);
  }
  redirect(SITE_PATHS.account);
}

export async function signInWithLinkAction(_previous: Previous, data: FormData): Promise<ActionResult> {
  try {
    const { tenantId, ip } = await siteWithSpace();
    if (!publicLimits.customerCode.attempt(`${tenantId}:${ip}`)) throw new AppError("rate_limited");
    const token = await withTenant(
      tenantId,
      (tx) => signInWithLink(tx, tenantId, String(data.get("token") ?? "")),
      undefined,
      null,
    );
    await setCustomerCookie(token);
  } catch (error) {
    return toActionError(error);
  }
  redirect(SITE_PATHS.account);
}

export async function logoutAction() {
  const { tenantId } = await currentSiteTenant();
  const token = await customerSessionToken();
  await withTenant(tenantId, (tx) => closeSession(tx, tenantId, token), undefined, null);
  await clearCustomerCookie();
  redirect(SITE_PATHS.account);
}

/** Export ou suppression des données : une demande par entreprise où la cliente est connue. */
export async function requestDataExportAction(_previous: Previous, data: FormData): Promise<ActionResult> {
  try {
    const { tenantId, ip } = await siteWithSpace();
    if (!publicLimits.manage.attempt(ip)) throw new AppError("rate_limited");
    const kind = z.enum(["export", "deletion"]).parse(data.get("kind"));
    const session = await customerSession(tenantId);
    if (!session) throw new AppError("login_invalid");
    const known = await withTenant(tenantId, (tx) => knownBusinesses(tx, tenantId, session), undefined, null);
    for (const businessId of known)
      await withTenant(
        tenantId,
        (tx) => requestDataAction(tx, tenantId, session, kind),
        undefined,
        businessId,
      );
    sendQueuedSoon();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
