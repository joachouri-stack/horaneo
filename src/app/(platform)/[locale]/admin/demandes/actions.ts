"use server";

import { z } from "zod";
import { adminMutation, form } from "@/lib/admin/mutation";
import type { ActionResult } from "@/lib/actions/result";
import { REQUEST_STATUSES, setRequestStatus } from "@/modules/requests/update-requests";

export async function setRequestStatusAction(_previous: ActionResult<unknown> | null, data: FormData) {
  const id = z.uuid().parse(form.text(data, "id"));
  const status = z.enum(REQUEST_STATUSES).parse(form.text(data, "status"));
  return adminMutation(
    (request: { tenantId: string }) => ({
      action: `update_request.${status}`,
      tenantId: request.tenantId,
      targetType: "update_request",
      targetId: id,
    }),
    (tx) => setRequestStatus(tx, id, status),
  );
}
