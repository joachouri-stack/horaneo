import { describe, expect, it } from "vitest";
import { settingsInput } from "@/modules/billing/admin";

/** Réseaux sociaux de la marque : adresse complète, sans « https:// », ou simple « @compte ». */
describe("adresses des réseaux sociaux (admin)", () => {
  const { social_tiktok, social_instagram, social_youtube, social_facebook } = settingsInput.shape;

  it("transforme un nom de compte en adresse de la page", () => {
    expect(social_tiktok.parse("@johane")).toBe("https://www.tiktok.com/@johane");
    expect(social_youtube.parse("johane")).toBe("https://www.youtube.com/@johane");
    expect(social_instagram.parse("@johane.beaute")).toBe("https://www.instagram.com/johane.beaute");
    expect(social_facebook.parse("johane")).toBe("https://www.facebook.com/johane");
  });

  it("garde une adresse complète et ajoute https:// si besoin", () => {
    expect(social_instagram.parse("https://www.instagram.com/johane")).toBe(
      "https://www.instagram.com/johane",
    );
    expect(social_tiktok.parse(" www.tiktok.com/@johane ")).toBe("https://www.tiktok.com/@johane");
  });

  it("un champ vide masque le réseau", () => {
    expect(social_facebook.parse("")).toBe("");
    expect(social_facebook.parse(undefined)).toBe("");
  });

  it("refuse un texte qui n'est pas une adresse", () => {
    expect(social_facebook.safeParse("mon compte facebook").success).toBe(false);
  });
});
