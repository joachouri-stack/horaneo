"use server";

import { setOnlineBooking } from "@/modules/booking/settings";
import { categoryFields } from "@/modules/catalog/icons";
import { billingGateway } from "@/lib/payments/stripe-billing";
import { changePlanManually } from "@/modules/billing/subscriptions";
import { completeOrdersOfTenant, linkOrderToTenant } from "@/modules/orders/orders";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { adminMutation, form, type ActionResult } from "@/lib/admin/mutation";
import { storage } from "@/lib/storage";
import { addCategoryLogo, deleteCategory, deleteService, saveCategory, saveService } from "@/modules/catalog/services";
import { SITE_PAGE_KEYS, PAGE_TEXT_FIELDS, updatePage } from "@/modules/content/pages";
import { deleteTestimonial, saveTestimonial } from "@/modules/content/testimonials";
import { restoreAsset, retireAsset, uploadAsset, uploadLogo } from "@/modules/media/assets";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { deleteStaff, saveStaff } from "@/modules/team/staff";
import {
  addBusinessManager,
  createBusiness,
  updateBusiness,
  updateBusinessProfile,
} from "@/modules/businesses/businesses";
import { createTenant } from "@/modules/tenants/create";
import {
  addCustomDomain,
  markDomainActive,
  removeCustomDomain,
  setPrimaryDomain,
} from "@/modules/tenants/domains";
import { changeStatus, updateAppearance, updateIdentity, updateSocial } from "@/modules/tenants/update";
import type { LogoPalette } from "@/lib/images/palette";

/**
 * Actions de l'espace admin sur les clients. Chacune passe par adminMutation :
 * droits revérifiés, transaction, journal.
 */

type Previous = ActionResult<unknown> | null;

const uuid = z.uuid();
const tenantIdOf = (data: FormData) => uuid.parse(form.text(data, "tenantId"));
const businessIdOf = (data: FormData) => uuid.parse(form.text(data, "businessId"));
const idOf = (data: FormData, key = "id") => {
  const value = form.optional(data, key);
  return value ? uuid.parse(value) : undefined;
};

// ─── Création ─────────────────────────────────────────────────────────────────

export async function createTenantAction(
  _previous: Previous,
  data: FormData,
): Promise<ActionResult<unknown>> {
  const result = await adminMutation(
    (created: Awaited<ReturnType<typeof createTenant>>) => ({
      action: "tenant.created",
      tenantId: created.tenant.id,
      details: { slug: created.tenant.slug, planCode: form.text(data, "planCode") },
    }),
    async (tx) => {
      const created = await createTenant(tx, {
        name: form.text(data, "name"),
        slug: form.text(data, "slug"),
        planCode: form.text(data, "planCode"),
        managerEmail: form.text(data, "managerEmail"),
        managerName: form.optional(data, "managerName"),
        phone: form.optional(data, "phone"),
        email: form.optional(data, "email"),
      });
      // Site créé à partir d'une commande : l'abonnement déjà payé lui est rattaché.
      const orderId = form.optional(data, "orderId");
      if (orderId) await linkOrderToTenant(tx, z.uuid().parse(orderId), created.tenant.id, billingGateway());
      return created;
    },
  );
  if (!result.ok) return result;
  redirect({
    href: { pathname: `/admin/clients/${result.data!.tenant.id}/modele`, query: { assistant: "1" } },
    locale: resolveLocale(await getLocale()),
  });
  return { ok: true };
}

// ─── Fiche : statut, pack, domaines ──────────────────────────────────────────

export async function changeStatusAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const action = z.enum(["activate", "suspend", "reactivate"]).parse(form.text(data, "statusAction"));
  return adminMutation(
    (change: Awaited<ReturnType<typeof changeStatus>>) => ({
      action: `tenant.${action}`,
      tenantId,
      details: change,
    }),
    async (tx) => {
      const change = await changeStatus(tx, tenantId, action);
      // Mise en ligne : la commande éventuelle est terminée et le professionnel prévenu.
      if (action === "activate") await completeOrdersOfTenant(tx, tenantId);
      return change;
    },
  );
}

export async function changePlanAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const planCode = form.text(data, "planCode");
  return adminMutation(
    (change: Awaited<ReturnType<typeof changePlanManually>>) => ({
      action: "tenant.plan_changed",
      tenantId,
      details: change,
    }),
    (tx) => changePlanManually(tx, tenantId, planCode),
  );
}

export async function addDomainAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const hostname = form.text(data, "hostname");
  return adminMutation(
    (domain: { hostname: string }) => ({
      action: "domain.added",
      tenantId,
      details: { hostname: domain.hostname },
    }),
    (tx) => addCustomDomain(tx, tenantId, hostname),
  );
}

export async function domainAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const domainId = idOf(data, "domainId")!;
  const operation = z.enum(["activate", "primary", "remove"]).parse(form.text(data, "operation"));
  const run = { activate: markDomainActive, primary: setPrimaryDomain, remove: removeCustomDomain }[
    operation
  ];
  return adminMutation(
    (domain: { hostname: string }) => ({
      action: `domain.${operation}`,
      tenantId,
      details: { hostname: domain.hostname },
    }),
    (tx) => run(tx, tenantId, domainId),
  );
}

// ─── Coordonnées, modèle, logo ───────────────────────────────────────────────

export async function updateIdentityAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const keys = [
    "name",
    "slug",
    "phone",
    "email",
    "addressLine1",
    "addressLine2",
    "postalCode",
    "city",
    "country",
    "timezone",
  ] as const;
  const input = Object.fromEntries(keys.map((key) => [key, form.text(data, key)])) as Record<
    (typeof keys)[number],
    string
  >;
  return adminMutation({ action: "tenant.identity_updated", tenantId }, (tx) =>
    updateIdentity(tx, tenantId, input),
  );
}

// ─── Entreprises ──────────────────────────────────────────────────────────────

const businessFields = (data: FormData) => ({
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

export async function updateBusinessAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const businessId = businessIdOf(data);
  return adminMutation(
    { action: "business.updated", tenantId, targetType: "business", targetId: businessId },
    (tx) => updateBusiness(tx, tenantId, businessId, businessFields(data)),
  );
}

export async function setOnlineBookingAdminAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const businessId = businessIdOf(data);
  return adminMutation(
    { action: "business.online_booking", tenantId, targetType: "business", targetId: businessId, businessId },
    (tx) => setOnlineBooking(tx, tenantId, form.bool(data, "onlineBookingEnabled"), businessId),
  );
}

export async function updateBusinessProfileAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const businessId = businessIdOf(data);
  return adminMutation(
    { action: "business.profile_updated", tenantId, targetType: "business", targetId: businessId },
    (tx) =>
      updateBusinessProfile(tx, tenantId, businessId, {
        slug: form.optional(data, "slug"),
        title: form.text(data, "title"),
        role: form.text(data, "role"),
        bio: form.text(data, "bio"),
        quote: form.text(data, "quote"),
        availability: form.text(data, "availability"),
        photoAssetId: form.optional(data, "photoAssetId") ?? null,
      }),
  );
}

export async function updateSocialAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return adminMutation({ action: "tenant.social_updated", tenantId }, (tx) =>
    updateSocial(tx, tenantId, {
      instagram: form.optional(data, "instagram"),
      facebook: form.optional(data, "facebook"),
    }),
  );
}

export async function createBusinessAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const result = await adminMutation(
    ({ business }: Awaited<ReturnType<typeof createBusiness>>) => ({
      action: "business.created",
      tenantId,
      targetType: "business",
      targetId: business.id,
    }),
    (tx) =>
      createBusiness(tx, tenantId, {
        ...businessFields(data),
        managerEmail: form.text(data, "managerEmail"),
        managerName: form.optional(data, "managerName") ?? null,
      }),
  );
  if (result.ok) {
    const t = await getTranslations("admin.tenant.businesses");
    return { ...result, message: t("added") };
  }
  return result;
}

export async function addBusinessManagerAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const result = await adminMutation(
    ({ business, managerId }: Awaited<ReturnType<typeof addBusinessManager>>) => ({
      action: "business.manager_added",
      tenantId,
      targetType: "business",
      targetId: business.id,
      details: { managerId },
    }),
    (tx) =>
      addBusinessManager(tx, tenantId, {
        businessId: form.text(data, "businessId"),
        email: form.text(data, "managerEmail"),
        name: form.optional(data, "managerName") ?? null,
      }),
  );
  if (result.ok) {
    const t = await getTranslations("admin.tenant.businesses");
    return { ...result, message: t("managerAdded") };
  }
  return result;
}

export async function updateAppearanceAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  return adminMutation({ action: "tenant.appearance_updated", tenantId }, (tx) =>
    updateAppearance(tx, tenantId, {
      businessCategory: form.optional(data, "businessCategory"),
      templateKey: form.text(data, "templateKey") as "wellness",
      theme: form.text(data, "theme") as "light",
      primary: form.text(data, "primary"),
      secondary: form.text(data, "secondary"),
    }),
  );
}

export async function uploadLogoAction(
  _previous: Previous,
  data: FormData,
): Promise<ActionResult<LogoPalette>> {
  const tenantId = tenantIdOf(data);
  const bytes = (await form.file(data, "file")) ?? new Uint8Array();
  const result = await adminMutation(
    (logo: { assetId: string }) => ({
      action: "asset.logo_uploaded",
      tenantId,
      targetType: "asset",
      targetId: logo.assetId,
    }),
    (tx, context) => uploadLogo(tx, storage(), tenantId, bytes, context.userId),
  );
  return result.ok ? { ok: true, data: result.data!.palette } : result;
}

// ─── Prestations ──────────────────────────────────────────────────────────────

export async function saveCategoryAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const id = idOf(data);
  return adminMutation(
    { action: id ? "category.updated" : "category.created", tenantId, businessId: businessIdOf(data) },
    (tx) => saveCategory(tx, tenantId, categoryFields(data), id),
  );
}

/** Logo envoyé depuis la catégorie : image gardée entière (type « Autre »), aussitôt cochée. */
export async function addCategoryLogoAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const id = idOf(data)!;
  const bytes = (await form.file(data, "file")) ?? new Uint8Array();
  return adminMutation(
    { action: "category.logo_added", tenantId, targetId: id, businessId: businessIdOf(data) },
    async (tx, context) => {
      const asset = await uploadAsset(tx, storage(), tenantId, {
        bytes,
        kind: "other",
        uploadedByUserId: context.userId,
        alt: form.optional(data, "alt"),
      });
      return addCategoryLogo(tx, tenantId, id, asset.id);
    },
  );
}

export async function deleteCategoryAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const id = idOf(data)!;
  return adminMutation(
    { action: "category.deleted", tenantId, targetId: id, businessId: businessIdOf(data) },
    (tx) => deleteCategory(tx, tenantId, id),
  );
}

export async function saveServiceAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const id = idOf(data);
  return adminMutation(
    {
      action: id ? "service.updated" : "service.created",
      tenantId,
      targetId: id,
      businessId: businessIdOf(data),
    },
    (tx) =>
      saveService(
        tx,
        tenantId,
        {
          name: form.text(data, "name"),
          description: form.optional(data, "description"),
          categoryId: form.optional(data, "categoryId") ?? null,
          durationMinutes: form.text(data, "durationMinutes") as unknown as number,
          bufferMinutes: (form.optional(data, "bufferMinutes") ?? "0") as unknown as number,
          price: form.text(data, "price"),
          priceFrom: form.bool(data, "priceFrom"),
          isOnlineBookable: form.bool(data, "isOnlineBookable"),
          isActive: form.bool(data, "isActive"),
        },
        id,
      ),
  );
}

export async function deleteServiceAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const id = idOf(data)!;
  const result = await adminMutation(
    { action: "service.deleted", tenantId, targetId: id, businessId: businessIdOf(data) },
    (tx) => deleteService(tx, tenantId, id),
  );
  if (result.ok && result.data?.deleted === false) {
    const t = await getTranslations("admin.tenant.services");
    return { ...result, message: t("deactivatedInstead") };
  }
  return result;
}

// ─── Équipe ───────────────────────────────────────────────────────────────────

export async function saveStaffAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const id = idOf(data);
  return adminMutation(
    {
      action: id ? "staff.updated" : "staff.created",
      tenantId,
      targetId: id,
      businessId: businessIdOf(data),
    },
    (tx) =>
      saveStaff(
        tx,
        tenantId,
        {
          name: form.text(data, "name"),
          bio: form.optional(data, "bio"),
          color: form.optional(data, "color"),
          isActive: form.bool(data, "isActive"),
          serviceIds: form.all(data, "serviceIds"),
          photoAssetId: form.optional(data, "photoAssetId") ?? null,
        },
        id,
      ),
  );
}

export async function deleteStaffAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const id = idOf(data)!;
  const result = await adminMutation(
    { action: "staff.deleted", tenantId, targetId: id, businessId: businessIdOf(data) },
    (tx) => deleteStaff(tx, tenantId, id),
  );
  if (result.ok && result.data?.deleted === false) {
    const t = await getTranslations("admin.tenant.team");
    return { ...result, message: t("deactivatedInstead", { upcoming: result.data.upcoming }) };
  }
  return result;
}

// ─── Horaires ─────────────────────────────────────────────────────────────────

export async function saveHoursAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const ranges = form
    .all(data, "range")
    .map((value) => {
      const [weekday, opensAt, closesAt] = value.split("|");
      return { weekday: Number(weekday), opensAt, closesAt };
    })
    .filter((range) => range.opensAt && range.closesAt);
  return adminMutation({ action: "hours.updated", tenantId, businessId: businessIdOf(data) }, (tx) =>
    replaceOpeningHours(tx, tenantId, ranges),
  );
}

// ─── Textes des pages ─────────────────────────────────────────────────────────

export async function savePageAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const pageKey = z.enum(SITE_PAGE_KEYS).parse(form.text(data, "pageKey"));
  const texts = Object.fromEntries(
    PAGE_TEXT_FIELDS[pageKey].map((field) => [field, form.text(data, `text.${field}`)]),
  );
  const photo = data.has("photoAssetId") ? (form.optional(data, "photoAssetId") ?? null) : undefined;
  return adminMutation({ action: "page.updated", tenantId, details: { pageKey } }, (tx) =>
    updatePage(tx, tenantId, {
      pageKey,
      texts,
      seoTitle: form.text(data, "seoTitle"),
      seoDescription: form.text(data, "seoDescription"),
      photoAssetId: photo,
      isPublished: form.bool(data, "isPublished"),
    }),
  );
}

// ─── Photos ───────────────────────────────────────────────────────────────────

export async function uploadPhotoAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const kind = z.enum(["gallery", "cover", "staff", "service", "other"]).parse(form.text(data, "kind"));
  const bytes = (await form.file(data, "file")) ?? new Uint8Array();
  return adminMutation(
    (asset: { id: string }) => ({
      action: "asset.uploaded",
      tenantId,
      targetType: "asset",
      targetId: asset.id,
      details: { kind },
    }),
    (tx, context) =>
      uploadAsset(tx, storage(), tenantId, {
        bytes,
        kind,
        uploadedByUserId: context.userId,
        alt: form.optional(data, "alt"),
      }),
  );
}

export async function photoAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const id = idOf(data)!;
  const operation = z.enum(["retire", "restore"]).parse(form.text(data, "operation"));
  return adminMutation(
    { action: `asset.${operation}d`, tenantId, targetType: "asset", targetId: id },
    (tx) => (operation === "retire" ? retireAsset(tx, tenantId, id) : restoreAsset(tx, tenantId, id)),
  );
}

// ─── Témoignages ──────────────────────────────────────────────────────────────

export async function saveTestimonialAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const id = idOf(data);
  return adminMutation(
    { action: id ? "testimonial.updated" : "testimonial.created", tenantId, targetId: id },
    (tx) =>
      saveTestimonial(
        tx,
        tenantId,
        {
          authorName: form.text(data, "authorName"),
          text: form.text(data, "text"),
          rating: form.optional(data, "rating") ? Number(form.text(data, "rating")) : null,
          isPublished: form.bool(data, "isPublished"),
        },
        id,
      ),
  );
}

export async function deleteTestimonialAction(_previous: Previous, data: FormData) {
  const tenantId = tenantIdOf(data);
  const id = idOf(data)!;
  return adminMutation({ action: "testimonial.deleted", tenantId, targetId: id }, (tx) =>
    deleteTestimonial(tx, tenantId, id),
  );
}
