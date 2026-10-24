"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { adminMutation, form } from "@/lib/admin/mutation";
import { saveLaunchOffer, setClaimStatus } from "@/modules/billing/launch-offers";

type Previous = ActionResult<unknown> | null;

/** Offre de lancement : places, conditions, activation. */
export async function saveLaunchOfferAction(_previous: Previous, data: FormData) {
  const offerId = z.uuid().parse(form.text(data, "offerId"));
  return adminMutation(
    (input: Awaited<ReturnType<typeof saveLaunchOffer>>) => ({
      action: "launch_offer.updated",
      targetType: "launch_offer",
      targetId: offerId,
      details: { quota: input.quota, isActive: input.isActive },
    }),
    (tx) =>
      saveLaunchOffer(tx, offerId, {
        title: form.text(data, "title"),
        conditions: form.text(data, "conditions"),
        quota: form.text(data, "quota"),
        isActive: form.bool(data, "isActive"),
        requiresCommitment: form.bool(data, "requiresCommitment"),
        endsOn: form.text(data, "endsOn"),
      }),
  );
}

/** Place attribuée : éligible, expédiée ou refusée. */
export async function setClaimStatusAction(_previous: Previous, data: FormData) {
  const claimId = z.uuid().parse(form.text(data, "claimId"));
  const status = z.enum(["eligible", "shipped", "refused", "cancelled"]).parse(form.text(data, "status"));
  return adminMutation(
    (change: Awaited<ReturnType<typeof setClaimStatus>>) => ({
      action: "launch_offer.claim_updated",
      targetType: "launch_offer_claim",
      targetId: claimId,
      details: change,
    }),
    (tx) => setClaimStatus(tx, claimId, status, form.text(data, "note")),
  );
}
