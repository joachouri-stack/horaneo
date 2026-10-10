"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { adminMutation, form } from "@/lib/admin/mutation";
import { billingGateway } from "@/lib/payments/stripe-billing";
import { savePlanOption } from "@/modules/billing/options";
import { setTenantOption } from "@/modules/billing/tenant-options";

type Previous = ActionResult<unknown> | null;

/** Catalogue : nom, description, tarif mensuel, proposée ou non, livrée ou « Bientôt ». */
export async function savePlanOptionAction(_previous: Previous, data: FormData) {
  const optionId = z.uuid().parse(form.text(data, "optionId"));
  return adminMutation(
    (result: Awaited<ReturnType<typeof savePlanOption>>) => ({
      action: "option.updated",
      targetType: "plan_option",
      targetId: optionId,
      details: result,
    }),
    (tx) =>
      savePlanOption(
        tx,
        optionId,
        {
          name: form.text(data, "name"),
          description: form.text(data, "description"),
          price: form.text(data, "price"),
          isActive: form.bool(data, "isActive"),
          isAvailable: form.bool(data, "isAvailable"),
        },
        billingGateway(),
      ),
  );
}

/** Active ou coupe une option pour un client (facturée sur son abonnement Stripe s'il en a un). */
export async function setTenantOptionAction(_previous: Previous, data: FormData) {
  const tenantId = z.uuid().parse(form.text(data, "tenantId"));
  const code = form.text(data, "code");
  const active = form.text(data, "active") === "yes";
  return adminMutation(
    (result: Awaited<ReturnType<typeof setTenantOption>>) => ({
      action: active ? "tenant.option_added" : "tenant.option_removed",
      tenantId,
      details: { code, ...result },
    }),
    (tx) => setTenantOption(tx, tenantId, { code, active }, billingGateway()),
  );
}
