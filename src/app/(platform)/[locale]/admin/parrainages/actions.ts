"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { adminMutation, form } from "@/lib/admin/mutation";
import { markReferralGranted } from "@/modules/billing/referrals";

type Previous = ActionResult<unknown> | null;

/** Mois offerts accordés à la main (marraine sans abonnement Stripe en cours). */
export async function markReferralGrantedAction(_previous: Previous, data: FormData) {
  const referralId = z.uuid().parse(form.text(data, "referralId"));
  return adminMutation(
    (change: Awaited<ReturnType<typeof markReferralGranted>>) => ({
      action: "referral.granted",
      targetType: "referral",
      targetId: referralId,
      details: { months: change.months },
    }),
    (tx) => markReferralGranted(tx, referralId),
  );
}
