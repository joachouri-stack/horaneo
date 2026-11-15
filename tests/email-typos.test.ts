import { describe, expect, it } from "vitest";
import { suggestEmail } from "@/lib/auth/email-typos";

describe("fautes de frappe dans l'adresse e-mail", () => {
  it("propose la messagerie courante la plus proche", () => {
    expect(suggestEmail("marie@gmial.com")).toBe("marie@gmail.com");
    expect(suggestEmail("marie@gmail.con")).toBe("marie@gmail.com");
    expect(suggestEmail("marie@hotmial.fr")).toBe("marie@hotmail.fr");
    expect(suggestEmail("marie@outlok.fr")).toBe("marie@outlook.fr");
    expect(suggestEmail("marie@orange.fe")).toBe("marie@orange.fr");
    expect(suggestEmail("Marie.Dupont@Yahooo.fr")).toBe("Marie.Dupont@yahoo.fr");
  });

  it("ne dit rien pour une adresse correcte ou un autre domaine", () => {
    expect(suggestEmail("marie@gmail.com")).toBeNull();
    expect(suggestEmail("contact@institut-lumiere.fr")).toBeNull();
    expect(suggestEmail("marie@gmx.fr")).toBeNull();
    expect(suggestEmail("pasunemail")).toBeNull();
  });
});
