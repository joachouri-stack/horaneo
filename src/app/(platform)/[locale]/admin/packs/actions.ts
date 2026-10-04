"use server";

import { z } from "zod";
import { adminMutation, form } from "@/lib/admin/mutation";
import { billingGateway } from "@/lib/payments/stripe-billing";
import { FEATURE_KEYS, savePlan, settingsInput, updatePlatformSettings } from "@/modules/billing/admin";
import type { ActionResult } from "@/lib/actions/result";

type Previous = ActionResult<unknown> | null;

export async function savePlanAction(_previous: Previous, data: FormData) {
  const planId = z.uuid().parse(form.text(data, "planId"));
  return adminMutation(
    (result: Awaited<ReturnType<typeof savePlan>>) => ({
      action: "plan.updated",
      targetType: "plan",
      targetId: planId,
      details: result,
    }),
    (tx) =>
      savePlan(
        tx,
        planId,
        {
          name: form.text(data, "name"),
          description: form.text(data, "description"),
          price: form.text(data, "price"),
          onlineBookingsPerMonth: form.text(data, "onlineBookingsPerMonth"),
          members: form.text(data, "members"),
          photos: form.text(data, "photos"),
          services: form.text(data, "services"),
          smsPerMonth: form.text(data, "smsPerMonth"),
          features: FEATURE_KEYS.filter((key) => form.bool(data, `feature_${key}`)),
          isPublic: form.bool(data, "isPublic"),
        },
        billingGateway(),
      ),
  );
}

export async function saveSettingsAction(_previous: Previous, data: FormData) {
  const raw = Object.fromEntries(Object.keys(settingsInput.shape).map((key) => [key, form.text(data, key)]));
  return adminMutation({ action: "settings.updated" }, (tx) => updatePlatformSettings(tx, raw as never));
}
