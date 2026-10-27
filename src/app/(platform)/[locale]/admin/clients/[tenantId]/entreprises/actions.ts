"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { adminMutation, form } from "@/lib/admin/mutation";
import { setOnlineBooking } from "@/modules/booking/settings";
import { updateBusiness, updateBusinessProfile } from "@/modules/businesses/businesses";

type Previous = ActionResult<unknown> | null;

const uuid = z.uuid();

/**
 * Fiche d'une entreprise en un seul enregistrement : identité et coordonnées, nom de
 * boutique, réservation en ligne et sa page sur le site. Une seule transaction : tout
 * est enregistré, ou rien (avec le champ en erreur signalé).
 */
export async function saveBusinessAction(_previous: Previous, data: FormData) {
  const tenantId = uuid.parse(form.text(data, "tenantId"));
  const businessId = uuid.parse(form.text(data, "businessId"));
  return adminMutation(
    { action: "business.updated", tenantId, targetType: "business", targetId: businessId, businessId },
    async (tx) => {
      // Identité d'abord : l'adresse de sa page est proposée à partir du nom, s'il change.
      await updateBusiness(tx, tenantId, businessId, {
        name: form.text(data, "name"),
        legalName: form.optional(data, "legalName"),
        siret: form.optional(data, "siret"),
        vatNumber: form.optional(data, "vatNumber"),
        email: form.optional(data, "email"),
        phone: form.optional(data, "phone"),
        addressLine1: form.optional(data, "addressLine1"),
        postalCode: form.optional(data, "postalCode"),
        city: form.optional(data, "city"),
        ...(data.has("googlePlaceId") ? { googlePlaceId: form.text(data, "googlePlaceId") } : {}),
      });
      await updateBusinessProfile(tx, tenantId, businessId, {
        shopName: form.text(data, "shopName"),
        slug: form.optional(data, "slug"),
        title: form.text(data, "title"),
        role: form.text(data, "role"),
        bio: form.text(data, "bio"),
        quote: form.text(data, "quote"),
        availability: form.text(data, "availability"),
        photoAssetId: form.optional(data, "photoAssetId") ?? null,
        instagram: form.text(data, "instagram"),
        facebook: form.text(data, "facebook"),
      });
      await setOnlineBooking(tx, tenantId, form.bool(data, "onlineBookingEnabled"), businessId);
      return { businessId };
    },
  );
}
