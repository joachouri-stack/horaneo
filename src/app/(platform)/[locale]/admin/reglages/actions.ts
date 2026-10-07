"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { adminMutation, form } from "@/lib/admin/mutation";
import { addShowcaseEntry, removeShowcaseEntry } from "@/modules/showcase/showcase";

type Previous = ActionResult<unknown> | null;

/** « Ils nous font confiance » : ajout d'un témoignage sur l'accueil. */
export async function addShowcaseAction(_previous: Previous, data: FormData) {
  return adminMutation(
    (entry: Awaited<ReturnType<typeof addShowcaseEntry>>) => ({
      action: "showcase.added",
      targetType: "showcase",
      targetId: entry.id,
    }),
    (tx) =>
      addShowcaseEntry(tx, {
        name: form.text(data, "name"),
        activity: form.text(data, "activity"),
        url: form.text(data, "url"),
        quote: form.text(data, "quote"),
        author: form.text(data, "author"),
      }),
  );
}

export async function removeShowcaseAction(_previous: Previous, data: FormData) {
  const id = z.uuid().parse(form.text(data, "id"));
  return adminMutation({ action: "showcase.removed", targetType: "showcase", targetId: id }, (tx) =>
    removeShowcaseEntry(tx, id),
  );
}
