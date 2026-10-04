import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { TestDb } from "./db";

let sequence = 0;

/**
 * Crée un tenant avec AU MOINS UNE LIGNE dans chaque table qui porte un
 * tenant_id. Les tests d'isolation vérifient ensuite chaque table.
 * Utilise la connexion propriétaire (sans restriction).
 */
export async function createTenantWithData(db: TestDb, label: string) {
  sequence += 1;
  const tag = `${label}-${sequence}-${Date.now()}`;
  const [plan] = await db.select().from(s.plans).where(eq(s.plans.code, "essentiel"));

  const [user] = await db
    .insert(s.users)
    .values({ email: `${tag}@example.com`, name: label })
    .returning();
  const [tenant] = await db
    .insert(s.tenants)
    .values({ slug: tag.toLowerCase(), name: `Institut ${label}`, planId: plan.id, status: "active" })
    .returning();
  const tenantId = tenant.id;
  const [business] = await db
    .insert(s.businesses)
    .values({ tenantId, name: `Institut ${label}`, siret: "12345678900012", isPrimary: true })
    .returning();
  const businessId = business.id;

  await db.insert(s.memberships).values({ businessId, userId: user.id, tenantId });
  const [domain] = await db
    .insert(s.tenantDomains)
    .values({
      tenantId,
      hostname: `${tag.toLowerCase()}.horaneo.com`,
      type: "subdomain",
      isPrimary: true,
      status: "active",
    })
    .returning();
  await db.insert(s.businessSettings).values({ businessId, tenantId });
  await db.insert(s.redirects).values({ tenantId, fromPath: "/ancien", toPath: "/" });

  const [asset] = await db
    .insert(s.assets)
    .values({
      tenantId,
      kind: "gallery",
      storageKey: `${tag}/photo.webp`,
      mimeType: "image/webp",
      bytes: 1000,
    })
    .returning();
  await db.insert(s.sitePages).values({ tenantId, pageKey: "home" });
  const [category] = await db
    .insert(s.serviceCategories)
    .values({ businessId, tenantId, name: { fr: "Visage" }, slug: { fr: "visage" } })
    .returning();
  const [service] = await db
    .insert(s.services)
    .values({
      businessId,
      tenantId,
      categoryId: category.id,
      name: { fr: "Soin" },
      durationMinutes: 60,
      priceCents: 6000,
    })
    .returning();
  const [staff] = await db
    .insert(s.staffMembers)
    .values({ businessId, tenantId, name: "Léa", photoAssetId: asset.id })
    .returning();
  await db.insert(s.staffServices).values({ businessId, tenantId, staffId: staff.id, serviceId: service.id });
  await db.insert(s.testimonials).values({ tenantId, authorName: "Camille", text: { fr: "Super" } });

  await db
    .insert(s.openingHours)
    .values({ businessId, tenantId, weekday: 1, opensAt: "09:00", closesAt: "18:00" });
  await db
    .insert(s.staffSchedules)
    .values({ businessId, tenantId, staffId: staff.id, weekday: 1, startsAt: "09:00", endsAt: "18:00" });
  await db.insert(s.timeOff).values({
    businessId,
    tenantId,
    staffId: staff.id,
    kind: "leave",
    startsAt: new Date("2026-12-24T00:00:00Z"),
    endsAt: new Date("2026-12-26T00:00:00Z"),
  });

  const [customer] = await db
    .insert(s.customers)
    .values({
      businessId,
      tenantId,
      firstName: "Camille",
      email: `client-${tag}@example.com`,
      phone: "+33612345678",
    })
    .returning();
  const [promo] = await db
    .insert(s.promoCodes)
    .values({ businessId, tenantId, code: "BIENVENUE", discountType: "percent", discountValue: 10 })
    .returning();
  const [appointment] = await db
    .insert(s.appointments)
    .values({
      businessId,
      tenantId,
      customerId: customer.id,
      staffId: staff.id,
      promoCodeId: promo.id,
      startsAt: new Date("2026-11-16T09:00:00Z"),
      endsAt: new Date("2026-11-16T10:00:00Z"),
      blockedUntil: new Date("2026-11-16T10:00:00Z"),
      status: "confirmed",
      source: "online",
      totalCents: 6000,
      depositCents: 1800,
    })
    .returning();
  await db.insert(s.appointmentItems).values({
    businessId,
    tenantId,
    appointmentId: appointment.id,
    serviceId: service.id,
    position: 1,
    serviceName: { fr: "Soin" },
    durationMinutes: 60,
    priceCents: 6000,
  });
  await db.insert(s.usageCounters).values({ tenantId, period: "2026-11", onlineBookings: 1 });

  const [payment] = await db
    .insert(s.payments)
    .values({
      businessId,
      tenantId,
      appointmentId: appointment.id,
      stripePaymentIntentId: `pi_${tag}`,
      stripeAccountId: `acct_${tag}`,
      amountCents: 1800,
      currency: "EUR",
      status: "succeeded",
    })
    .returning();
  await db.insert(s.refunds).values({ businessId, tenantId, paymentId: payment.id, amountCents: 1800 });
  await db.insert(s.subscriptions).values({ tenantId, planId: plan.id, status: "active" });
  await db.insert(s.orders).values({
    userId: user.id,
    planId: plan.id,
    businessName: `Institut ${label}`,
    activity: "beauté",
    phone: "+33612345678",
    status: "done",
    tenantId,
  });

  await db.insert(s.messageLog).values({
    businessId,
    tenantId,
    appointmentId: appointment.id,
    channel: "email",
    templateKey: "booking_confirmation",
    recipient: `client-${tag}@example.com`,
    locale: "fr",
  });
  await db
    .insert(s.updateRequests)
    .values({ tenantId, createdByUserId: user.id, subject: "Logo", message: "Nouveau logo" });
  await db.insert(s.auditLog).values({ action: "tenant.created", tenantId, actorUserId: user.id });

  return { tenant, business, user, domain, service, staff, customer, appointment };
}
