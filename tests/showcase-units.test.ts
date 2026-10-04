import { describe, expect, it } from "vitest";
import { DEFAULT_PLANS } from "@/config/defaults";
import { planItems, planTiles, type ShowcaseItem } from "@/modules/billing/showcase";

const label = (item: ShowcaseItem) =>
  item.kind === "everythingIn"
    ? `tout:${item.planIndex}`
    : `${item.kind === "missing" ? "-" : "+"}${item.key}`;

describe("présentation des packs sur le site commercial", () => {
  it("donne les trois chiffres clés de chaque pack", () => {
    expect(DEFAULT_PLANS.map(planTiles)).toEqual([
      [{ key: "bookings", count: 5 }, { key: "members", count: 1 }, { key: "emailReminders" }],
      [
        { key: "bookings", count: null },
        { key: "members", count: 3 },
        { key: "sms", count: 30 },
      ],
      [
        { key: "bookings", count: null },
        { key: "members", count: null },
        { key: "sms", count: 150 },
      ],
    ]);
  });

  it("liste ce que chaque pack ajoute et ce qui lui manque", () => {
    expect(planItems(DEFAULT_PLANS, 0).map(label)).toEqual([
      "+basePage",
      "+agenda",
      "+photosServices",
      "-customDomain",
      "-onlinePayment",
      "-smsReminders",
    ]);
    expect(planItems(DEFAULT_PLANS, 0)[2]).toMatchObject({ values: { photos: 5, services: 10 } });
    expect(planItems(DEFAULT_PLANS, 1).map(label)).toEqual([
      "+fullSite",
      "+customDomain",
      "+onlinePayment",
      "+promoCodes",
      "+monthlyUpdate",
      "-stats",
      "-whatsappSupport",
    ]);
    expect(planItems(DEFAULT_PLANS, 2).map(label)).toEqual([
      "tout:1",
      "+onDemandUpdates",
      "+unlimitedPhotos",
      "+statsSummary",
      "+googleReviews",
      "+whatsappSupport",
      "+giftCards",
    ]);
  });

  it("suit les réglages de l'admin", () => {
    const plans = structuredClone(DEFAULT_PLANS);
    plans[1].features.whatsappSupport = true;
    plans[1].limits.smsPerMonth = 0;
    expect(planItems(plans, 1).map(label)).toContain("+whatsappSupport");
    expect(planItems(plans, 1).map(label)).toContain("-smsReminders");
    expect(planItems(plans, 2).map(label)).not.toContain("+whatsappSupport");
  });
});
