import { describe, expect, it } from "vitest";
import { DEFAULT_PLANS, DEFAULT_SITE_ONLY_PLANS } from "@/config/defaults";
import { planItems, planTiles, splitPlans, type ShowcaseItem } from "@/modules/billing/showcase";

const label = (item: ShowcaseItem) =>
  item.kind === "everythingIn"
    ? `tout:${item.planIndex}`
    : `${item.kind === "missing" ? "-" : item.kind === "soon" ? "~" : "+"}${item.key}`;

describe("présentation des packs sur le site commercial", () => {
  it("donne les trois chiffres clés de chaque pack", () => {
    expect(DEFAULT_PLANS.map(planTiles)).toEqual([
      [{ key: "bookings", count: 5 }, { key: "members", count: 1 }, { key: "emailReminders" }],
      [
        { key: "bookings", count: null },
        { key: "members", count: 3 },
        { key: "sms", count: 100 },
      ],
      [
        { key: "bookings", count: null },
        { key: "members", count: null },
        { key: "sms", count: 300 },
      ],
    ]);
  });

  it("liste ce que chaque pack ajoute et ce qui lui manque", () => {
    expect(planItems(DEFAULT_PLANS, 0).map(label)).toEqual([
      "+basePage",
      "+agenda",
      "+photosServices",
      "+emailReminders",
      "-customDomain",
      "-onlinePayment",
      "-smsReminders",
    ]);
    expect(planItems(DEFAULT_PLANS, 0)[2]).toMatchObject({ values: { photos: 5, services: 10 } });
    expect(planItems(DEFAULT_PLANS, 1).map(label)).toEqual([
      "+emailReminders",
      "+fullSite",
      "+customDomain",
      "+onlinePayment",
      "+promoCodes",
      "+promotions",
      "+testimonials",
      "+customerSpace",
      "+monthlyUpdate",
      "+photosLimit",
      "-stats",
      "-whatsappSupport",
    ]);
    expect(planItems(DEFAULT_PLANS, 2).map(label)).toEqual([
      "tout:1",
      "+emailReminders",
      "+onDemandUpdates",
      "+unlimitedPhotos",
      "+statsSummary",
      "+whatsappSupport",
      "+giftCards",
      "+loyalty",
      "+googleReviews",
      "~aiMessaging",
    ]);
    // L'Essentiel annonce sa limite de photos (plus haute que le Basic, pas illimitée).
    expect(
      planItems(DEFAULT_PLANS, 1).find((item) => item.kind === "included" && item.key === "photosLimit"),
    ).toMatchObject({
      values: { photos: 20 },
    });
  });

  it("sépare les packs avec réservation des packs « site seul », chacun dans son ordre", () => {
    const { booking, siteOnly } = splitPlans([...DEFAULT_PLANS, ...DEFAULT_SITE_ONLY_PLANS]);
    expect(booking.map((plan) => plan.code)).toEqual(["basic", "essentiel", "serenite"]);
    expect(siteOnly.map((plan) => plan.code)).toEqual(["express", "vitrine", "signature"]);
  });

  it("présente un pack « site seul » par la taille du site, sans agenda ni rappels", () => {
    expect(planTiles(DEFAULT_SITE_ONLY_PLANS[0])).toEqual([
      { key: "pages", fullSite: false },
      { key: "photos", count: 10 },
      { key: "domain" },
    ]);
    expect(planTiles(DEFAULT_SITE_ONLY_PLANS[2])[1]).toEqual({ key: "photos", count: null });
    const labels = DEFAULT_SITE_ONLY_PLANS.flatMap((_, index) =>
      planItems(DEFAULT_SITE_ONLY_PLANS, index).map(label),
    );
    expect(labels).not.toContain("+agenda");
    expect(labels).not.toContain("-smsReminders");
    expect(planItems(DEFAULT_SITE_ONLY_PLANS, 1).map(label)[0]).toBe("tout:0");
  });

  it("présente les packs « site seul » du moins cher au plus complet", () => {
    expect(
      DEFAULT_SITE_ONLY_PLANS.map((_, index) => planItems(DEFAULT_SITE_ONLY_PLANS, index).map(label)),
    ).toEqual([
      [
        "+onePage",
        "+photosServices",
        "+customDomain",
        "+localSeo",
        "+contactButtons",
        "+mobileReady",
        "-fullSite",
        "-googleReviews",
      ],
      [
        "tout:0",
        "+fullSite",
        "+sitePages",
        "+googleReviews",
        "+testimonials",
        "+promotions",
        "+monthlyUpdate",
        "-whatsappSupport",
        "-giftCards",
      ],
      ["tout:1", "+customDesign", "+giftCards", "+onDemandUpdates", "+whatsappSupport"],
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
