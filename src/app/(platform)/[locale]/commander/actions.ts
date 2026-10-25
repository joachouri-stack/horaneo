"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { publicAppUrl } from "@/config/env";
import { withPlatform } from "@/db/access";
import { resolveLocale } from "@/i18n/translator";
import { toActionError, type ActionResult } from "@/lib/actions/result";
import { form } from "@/lib/admin/mutation";
import { getCurrentSession } from "@/lib/auth/session";
import { clientIp } from "@/lib/client-ip";
import { sendQueuedSoon } from "@/lib/jobs/tick";
import { billingGateway } from "@/lib/payments/stripe-billing";
import { createRateLimiter } from "@/lib/rate-limit";
import { AppError } from "@/modules/errors";
import { parseInterval } from "@/modules/billing/yearly";
import { findOrCreateOrderCustomer } from "@/modules/orders/customer";
import { createOrder } from "@/modules/orders/orders";

const orderAttempts = createRateLimiter({ max: 10, windowMs: 10 * 60 * 1000 });

/**
 * Commande d'un pack : page de paiement Stripe (pack payant) ou confirmation (Basic).
 * Sans être connectée, la personne donne son e-mail, son prénom et son nom :
 * son compte est retrouvé ou créé avec la commande.
 */
export async function submitOrderAction(
  _previous: ActionResult<unknown> | null,
  data: FormData,
): Promise<ActionResult<unknown>> {
  const session = await getCurrentSession();
  const limitKey = session?.user.id ?? `ip:${clientIp(await headers()) ?? "unknown"}`;
  if (!orderAttempts.attempt(limitKey)) return toActionError(new AppError("rate_limited"));
  const locale = resolveLocale(await getLocale());
  const base = `${publicAppUrl()}/${locale}/commander`;
  let target: string;
  try {
    // Conditions générales de vente acceptées (case obligatoire, vérifiée aussi ici).
    if (data.get("acceptTerms") !== "on") throw new AppError("terms_required", "acceptTerms");
    const result = await withPlatform(async (tx) =>
      createOrder(
        tx,
        session?.user.id ??
          (await findOrCreateOrderCustomer(
            tx,
            {
              email: form.text(data, "email"),
              firstName: form.text(data, "firstName"),
              lastName: form.text(data, "lastName"),
            },
            locale,
          )),
        {
          planCode: form.text(data, "planCode"),
          businessName: form.text(data, "businessName"),
          activity: form.text(data, "activity"),
          phone: form.text(data, "phone"),
          currentWebsite: form.optional(data, "currentWebsite"),
          // Formule des packs payants (avec engagement par défaut).
          withCommitment: data.get("commitment") !== "no",
          optionCodes: data.get("billing") === "year" ? [] : data.getAll("options").map(String),
          billingInterval: parseInterval(data.get("billing")),
          locale,
        },
        billingGateway(),
        (orderId) => ({
          successUrl: `${base}/merci?commande=${orderId}`,
          cancelUrl: `${base}?pack=${encodeURIComponent(form.text(data, "planCode"))}${data.get("billing") === "year" ? "&billing=year" : ""}`,
        }),
      ),
    );
    sendQueuedSoon();
    target = result.kind === "redirect" ? result.url : `${base}/merci?commande=${result.orderId}`;
  } catch (error) {
    if (error instanceof AppError && error.code === "already_customer") {
      target = `${publicAppUrl()}/${locale}/espace`;
    } else {
      return toActionError(error);
    }
  }
  redirect(target);
}
