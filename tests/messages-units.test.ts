import { describe, expect, it } from "vitest";
import { renderEmail } from "@/modules/messages/layout";
import { smsSenderName, toGsm7 } from "@/modules/messages/senders";

describe("expéditeur des SMS", () => {
  it("nom de l'établissement sans accent, 11 caractères au plus", () => {
    expect(smsSenderName("Spa Démo Lyon", "Horaneo")).toBe("Spa Demo Ly");
    expect(smsSenderName("L'Atelier", "Horaneo")).toBe("LAtelier");
    expect(smsSenderName("Салон", "Horaneo")).toBe("Horaneo");
    expect(smsSenderName("12", "Horaneo")).toBe("Horaneo");
  });
});

describe("texte des SMS", () => {
  it("reste dans l'alphabet standard (un SMS au lieu de deux)", () => {
    expect(
      toGsm7("Rappel : rendez-vous demain à 10:00 chez La Forêt Câline. Pour annuler ou déplacer : 06 12"),
    ).toBe("Rappel : rendez-vous demain à 10:00 chez La Foret Caline. Pour annuler ou déplacer : 06 12");
    expect(toGsm7("« Cœur » façon\u00a0été")).toBe('" Coeur " facon été');
  });
});

describe("mise en page des e-mails", () => {
  it("échappe les textes saisis (nom, message) et garde une couleur lisible", () => {
    const { html, text } = renderEmail({
      locale: "fr",
      brandName: "<script>alert(1)</script>",
      color: "#ffff00",
      title: "Titre",
      paragraphs: ["Bonjour <b>Camille</b>"],
      details: [{ label: "Date", value: "mardi" }],
      action: { label: "Voir", url: "https://exemple.test/?a=1&b=2" },
      footer: ["Pied"],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Bonjour &lt;b&gt;Camille&lt;/b&gt;");
    expect(html).toContain("https://exemple.test/?a=1&amp;b=2");
    // Jaune trop clair sur blanc : assombri pour rester lisible.
    expect(html).not.toContain("background:#ffff00");
    expect(text).toContain("Date : mardi");
    expect(text).toContain("Voir : https://exemple.test/?a=1&b=2");
  });
});
