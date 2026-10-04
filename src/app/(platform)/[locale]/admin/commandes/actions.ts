"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { adminMutation, form } from "@/lib/admin/mutation";
import { billingGateway } from "@/lib/payments/stripe-billing";
import { publishLegalDocument } from "@/modules/legal/documents";
import { rejectOrder } from "@/modules/orders/orders";

type Previous = ActionResult<unknown> | null;

export async function rejectOrderAction(_previous: Previous, data: FormData) {
  const orderId = z.uuid().parse(form.text(data, "orderId"));
  return adminMutation({ action: "order.rejected", targetType: "order", targetId: orderId }, (tx) =>
    rejectOrder(tx, orderId, form.text(data, "reason"), billingGateway()),
  );
}

export async function publishLegalAction(_previous: Previous, data: FormData) {
  return adminMutation(
    (doc: Awaited<ReturnType<typeof publishLegalDocument>>) => ({
      action: "legal.published",
      targetType: "legal_document",
      targetId: doc.id,
      details: { key: doc.key, locale: doc.locale, version: doc.version },
    }),
    (tx) =>
      publishLegalDocument(tx, {
        key: form.text(data, "key") as never,
        locale: form.text(data, "locale"),
        title: form.text(data, "title"),
        content: form.text(data, "content"),
      }),
  );
}
