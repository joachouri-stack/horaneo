"use server";

import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { withPlatform } from "@/db/access";
import { resolveLocale } from "@/i18n/translator";
import { toActionError, type ActionResult } from "@/lib/actions/result";
import { form } from "@/lib/admin/mutation";
import { clientIp } from "@/lib/client-ip";
import { sendQueuedSoon } from "@/lib/jobs/tick";
import { createRateLimiter } from "@/lib/rate-limit";
import { AppError } from "@/modules/errors";
import { requestCallback } from "@/modules/orders/callback";

const callbackAttempts = createRateLimiter({ max: 5, windowMs: 60 * 60 * 1000 });

/** Demande « Être rappelé » : sans compte, limitée par adresse IP. */
export async function requestCallbackAction(
  _previous: ActionResult<unknown> | null,
  data: FormData,
): Promise<ActionResult<unknown>> {
  // Champ caché que seuls les robots remplissent : on fait comme si tout allait bien.
  const t = await getTranslations("callback");
  if (form.text(data, "website") !== "") return { ok: true, message: t("sent") };
  const ip = clientIp(await headers()) ?? "unknown";
  if (!callbackAttempts.attempt(ip)) return toActionError(new AppError("rate_limited"));
  const locale = resolveLocale(await getLocale());
  try {
    await withPlatform((tx) =>
      requestCallback(tx, {
        name: form.text(data, "name"),
        businessName: form.text(data, "businessName"),
        phone: form.text(data, "phone"),
        email: form.text(data, "email"),
        planCode: form.text(data, "planCode"),
        solution: form.text(data, "solution"),
        message: form.text(data, "message"),
        locale,
      }),
    );
  } catch (error) {
    return toActionError(error);
  }
  sendQueuedSoon();
  return { ok: true, message: t("sent") };
}
