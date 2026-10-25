"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { publicAppUrl } from "@/config/env";
import { withPlatform } from "@/db/access";
import { resolveLocale } from "@/i18n/translator";
import { toActionError, type ActionResult } from "@/lib/actions/result";
import { form } from "@/lib/admin/mutation";
import { getCurrentSession } from "@/lib/auth/session";
import { sendQueuedSoon } from "@/lib/jobs/tick";
import { billingGateway } from "@/lib/payments/stripe-billing";
import { createRateLimiter } from "@/lib/rate-limit";
import { AppError } from "@/modules/errors";
import { parseInterval } from "@/modules/billing/yearly";
import { createOrder } from "@/modules/orders/orders";

const orderAttempts = createRateLimiter({ max: 10, windowMs: 10 * 60 * 1000 });

/** Commande d'un pack : page de paiement Stripe (pack payant) ou confirmation (Basic). */
export async function submitOrderAction(
  _previous: ActionResult<unknown> | null,
  data: FormData,
): Promise<ActionResult<unknown>> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "not_found" };
  if (!orderAttempts.attempt(session.user.id)) return toActionError(new AppError("rate_limited"));
  const locale = resolveLocale(await getLocale());
  const base = `${publicAppUrl()}/${locale}/commander`;
  let target: string;
  try {
    // Conditions générales de vente acceptées (case obligatoire, vérifiée aussi ici).
    if (data.get("acceptTerms") !== "on") throw new AppError("terms_required", "acceptTerms");
    const result = await withPlatform((tx) =>
      createOrder(
        tx,
        session.user.id,
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
