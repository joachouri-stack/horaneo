import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { createLocalStorage } from "@/lib/storage/local";
import type { CategoryIcon } from "@/modules/catalog/icons";
import { listServices, saveCategory, saveService } from "@/modules/catalog/services";
import { updateGiftCardSettings } from "@/modules/giftcards/giftcards";
import { savePromotion } from "@/modules/promotions/promotions";
import { updatePage } from "@/modules/content/pages";
import { saveTestimonial } from "@/modules/content/testimonials";
import { savePromoCode } from "@/modules/promo/codes";
import { uploadAsset, uploadLogo } from "@/modules/media/assets";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { saveStaff } from "@/modules/team/staff";
import { createBusiness, updateBusiness, updateBusinessProfile } from "@/modules/businesses/businesses";
import { createTenant } from "@/modules/tenants/create";
import { changeStatus, updateAppearance, updateIdentity, updateSocial } from "@/modules/tenants/update";
import { declareBusiness } from "./access";
import { createDb, type Transaction } from "./client";
import { tenants } from "./schema";

/**
 * Établissements de démonstration pour le développement local :
 * - http://institut-demo.localhost:3000 : pack Basic (fiche d'une page) ;
 * - http://spa-demo.localhost:3000 : pack Sérénité (site complet, ambiance nature) ;
 * - http://duo-demo.localhost:3000 : un site, deux entreprises (deux indépendantes) ;
 * - http://ma-beaute-demo.localhost:3000 : modèle Atelier (maquettes de Ma Beauté Institut).
 * Refuse de s'exécuter en production. Relançable : ne recrée pas ce qui existe.
 */

const storage = createLocalStorage(process.env.LOCAL_STORAGE_DIR ?? "storage");

/** Image de démonstration : dégradé doux de deux couleurs. */
async function demoImage(from: string, to: string, width = 1600, height = 1000): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${width * 0.7}" cy="${height * 0.4}" r="${height * 0.25}" fill="#ffffff" fill-opacity="0.18"/>
  </svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer());
}

async function demoLogo(text: string, color: string, accent: string): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160">
    <circle cx="80" cy="80" r="56" fill="${accent}"/><circle cx="80" cy="80" r="24" fill="#ffffff"/>
    <text x="160" y="104" font-family="Georgia, serif" font-size="64" fill="${color}">${text}</text></svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
}

async function exists(tx: Transaction, slug: string) {
  return (await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug))).length > 0;
}

const weekHours = (days: number[], ranges: [string, string][]) =>
  days.flatMap((weekday) => ranges.map(([opensAt, closesAt]) => ({ weekday, opensAt, closesAt })));

async function seedBasic(tx: Transaction) {
  if (await exists(tx, "institut-demo")) return;
  const { tenant, business } = await createTenant(tx, {
    name: "Institut Démo",
    slug: "institut-demo",
    planCode: "basic",
    managerEmail: "gerante@institut-demo.test",
    phone: "04 78 00 00 00",
  });
  await declareBusiness(tx, business.id);
  await updateIdentity(tx, tenant.id, {
    name: "Institut Démo",
    slug: "institut-demo",
    phone: "04 78 00 00 00",
    addressLine1: "12 rue de la République",
    postalCode: "69002",
    city: "Lyon",
    country: "FR",
    timezone: "Europe/Paris",
  });
  await updateAppearance(tx, tenant.id, {
    templateKey: "wellness",
    theme: "light",
    primary: "#b0476a",
    secondary: "#f6e7ec",
  });
  await updatePage(tx, tenant.id, {
    pageKey: "home",
    texts: {
      tagline: "Soins du visage et épilations à Lyon",
      intro: "Un institut chaleureux, des soins sur mesure et des produits naturels.",
    },
  });
  const serviceIds: string[] = [];
  for (const [name, duration, price] of [
    ["Soin du visage éclat", 45, "39"],
    ["Épilation sourcils", 15, "12"],
    ["Beauté des mains", 30, "25"],
  ] as const) {
    serviceIds.push((await saveService(tx, tenant.id, { name, durationMinutes: duration, price })).id);
  }
  await replaceOpeningHours(tx, tenant.id, [
    ...weekHours(
      [2, 3, 4, 5],
      [
        ["09:30", "12:30"],
        ["14:00", "19:00"],
      ],
    ),
    ...weekHours([6], [["09:00", "17:00"]]),
  ]);
  await saveStaff(tx, tenant.id, { name: "Marie", serviceIds });
  await changeStatus(tx, tenant.id, "activate");
}

async function seedFull(tx: Transaction) {
  if (await exists(tx, "spa-demo")) return;
  const { tenant, business } = await createTenant(tx, {
    name: "Spa Démo Lyon",
    slug: "spa-demo",
    planCode: "serenite",
    managerEmail: "gerante@spa-demo.test",
    phone: "04 72 00 00 00",
  });
  const id = tenant.id;
  await declareBusiness(tx, business.id);
  await updateBusiness(tx, id, business.id, {
    name: "Spa Démo Lyon",
    legalName: "Spa Démo SARL",
    siret: "123 456 789 00012",
    email: "contact@spa-demo.test",
    phone: "04 72 00 00 00",
    addressLine1: "8 quai Saint-Antoine",
    postalCode: "69002",
    city: "Lyon",
  });
  await updateIdentity(tx, id, {
    name: "Spa Démo Lyon",
    slug: "spa-demo",
    phone: "04 72 00 00 00",
    email: "contact@spa-demo.test",
    addressLine1: "8 quai Saint-Antoine",
    postalCode: "69002",
    city: "Lyon",
    country: "FR",
    timezone: "Europe/Paris",
    latitude: "45.7627",
    longitude: "4.8314",
  });
  await uploadLogo(tx, storage, id, await demoLogo("Spa Démo", "#2f5d50", "#c08457"), null);
  await updateAppearance(tx, id, {
    templateKey: "wellness",
    theme: "nature",
    primary: "#2f5d50",
    secondary: "#e7dcc8",
  });

  const cover = await uploadAsset(tx, storage, id, {
    bytes: await demoImage("#7d9d8c", "#e7dcc8", 2400, 1400),
    kind: "cover",
    uploadedByUserId: null,
    alt: "L'espace détente",
  });
  const about = await uploadAsset(tx, storage, id, {
    bytes: await demoImage("#c08457", "#f3e9dc"),
    kind: "gallery",
    uploadedByUserId: null,
    alt: "Cabine de massage",
  });
  for (const [from, to, alt] of [
    ["#5f8575", "#d9c7a8", "Hammam"],
    ["#a3b8a0", "#f5efe4", "Salle de repos"],
    ["#8f6f5a", "#e8d9c4", "Produits naturels"],
  ] as const) {
    await uploadAsset(tx, storage, id, {
      bytes: await demoImage(from, to),
      kind: "gallery",
      uploadedByUserId: null,
      alt,
    });
  }

  await updatePage(tx, id, {
    pageKey: "home",
    texts: {
      tagline: "Une parenthèse de calme au cœur de Lyon",
      intro:
        "Massages, soins du visage et rituels bien-être, dans un lieu pensé pour la détente.\nNos praticiennes vous accueillent du mardi au samedi.",
    },
    photoAssetId: cover.id,
  });
  await updatePage(tx, id, {
    pageKey: "about",
    texts: {
      title: "Notre spa",
      body: "Ouvert en 2019, notre spa associe savoir-faire traditionnel et produits naturels.\nChaque soin commence par un temps d'échange pour l'adapter à vos envies.",
    },
    photoAssetId: about.id,
  });
  await updatePage(tx, id, {
    pageKey: "practical",
    texts: { access: "Métro Cordeliers (ligne A), à 3 minutes à pied.\nParking Saint-Antoine à proximité." },
  });

  const massages = await saveCategory(tx, id, {
    name: "Massages",
    description: "Des massages relaxants ou toniques, adaptés à vos besoins.",
  });
  const visage = await saveCategory(tx, id, { name: "Soins du visage" });
  const services = [];
  for (const [categoryId, name, duration, price, description, priceFrom] of [
    [massages.id, "Massage relaxant", 60, "75", "Un massage enveloppant aux huiles chaudes.", false],
    [massages.id, "Massage aux pierres chaudes", 75, "89", "", false],
    [massages.id, "Massage dos express", 30, "45", "", false],
    [visage.id, "Soin éclat", 45, "59", "Nettoyage, gommage et masque pour un teint lumineux.", false],
    [visage.id, "Soin anti-âge sur mesure", 90, "110", "", true],
  ] as const) {
    services.push(
      await saveService(tx, id, {
        categoryId,
        name,
        durationMinutes: duration,
        price,
        description,
        priceFrom,
      }),
    );
  }
  await replaceOpeningHours(tx, id, [
    ...weekHours([2, 3, 4, 5], [["10:00", "19:00"]]),
    ...weekHours([6], [["09:30", "18:00"]]),
  ]);
  await saveStaff(tx, id, {
    name: "Léa",
    bio: "Praticienne en massages depuis 10 ans.",
    serviceIds: services.slice(0, 3).map((s) => s.id),
    color: "#2f5d50",
  });
  await saveStaff(tx, id, {
    name: "Inès",
    bio: "Experte des soins du visage.",
    serviceIds: services.slice(3).map((s) => s.id),
    color: "#c08457",
  });
  await saveTestimonial(tx, id, {
    authorName: "Camille",
    text: "Un moment hors du temps, Léa est formidable.",
    rating: 5,
  });
  await saveTestimonial(tx, id, {
    authorName: "Sophie",
    text: "Accueil chaleureux et soin du visage parfait.",
    rating: 5,
  });
  await saveTestimonial(tx, id, {
    authorName: "Nadia",
    text: "Très bon massage, je recommande !",
    rating: 4,
  });
  await savePromoCode(tx, id, { code: "BIENVENUE10", discountType: "percent", discountValue: "10" });
  await changeStatus(tx, id, "activate");
}

/** Deux indépendantes dans le même institut, chacune avec son SIRET (un site, deux entreprises). */
async function seedDuo(tx: Transaction) {
  if (await exists(tx, "duo-demo")) return;
  const { tenant, business: first } = await createTenant(tx, {
    name: "Institut Duo Démo",
    slug: "duo-demo",
    planCode: "serenite",
    managerEmail: "lea@duo-demo.test",
    managerName: "Léa",
  });
  const id = tenant.id;
  await updateIdentity(tx, id, {
    name: "Institut Duo Démo",
    slug: "duo-demo",
    phone: "04 90 00 00 00",
    addressLine1: "10 avenue des Platanes",
    postalCode: "84000",
    city: "Avignon",
    country: "FR",
    timezone: "Europe/Paris",
  });
  await updateAppearance(tx, id, {
    templateKey: "wellness",
    theme: "light",
    primary: "#b5654a",
    secondary: "#f7e4dc",
  });
  await updatePage(tx, id, {
    pageKey: "home",
    texts: { tagline: "Esthétique et massages", intro: "Deux professionnelles, un même lieu." },
  });
  await updateBusiness(tx, id, first.id, {
    name: "Léa",
    legalName: "Léa Martin EI",
    siret: "111 222 333 00011",
    phone: "06 00 00 00 01",
    email: "lea@duo-demo.test",
  });
  const { business: second } = await createBusiness(tx, id, {
    name: "Inès",
    legalName: "Inès Durand EI",
    siret: "444 555 666 00022",
    phone: "06 00 00 00 02",
    email: "ines@duo-demo.test",
    managerEmail: "ines@duo-demo.test",
    managerName: "Inès",
  });
  const hours = [
    ...weekHours([1, 2, 3, 4, 5], [["09:00", "19:00"]]),
    ...weekHours([6], [["10:00", "20:00"]]),
  ];
  for (const [business, staff, category, catalog] of [
    [
      first.id,
      "Léa",
      "Beauté du regard",
      [
        ["Réhaussement de cils", 60, "55"],
        ["Browlift", 35, "45"],
      ],
    ],
    [
      second.id,
      "Inès",
      "Massages",
      [
        ["Deep tissue 30 min", 30, "55"],
        ["Aromathérapie", 60, "60"],
      ],
    ],
  ] as const) {
    await declareBusiness(tx, business);
    await replaceOpeningHours(tx, id, hours);
    const saved = await saveCategory(tx, id, { name: category });
    const serviceIds: string[] = [];
    for (const [name, duration, price] of catalog) {
      serviceIds.push(
        (await saveService(tx, id, { categoryId: saved.id, name, durationMinutes: duration, price })).id,
      );
    }
    await saveStaff(tx, id, { name: staff, serviceIds });
  }
  await declareBusiness(tx, null);
  await changeStatus(tx, id, "activate");
}

/**
 * Démo du modèle Atelier, avec les textes et tarifs des maquettes de Ma Beauté
 * Institut. Photos : fichiers du dossier DEMO_PHOTOS_DIR s'il est fourni
 * (laila.jpg, natacha.jpg, facade.jpg, logo.png), sinon des dégradés.
 */
async function seedAtelier(tx: Transaction) {
  if (await exists(tx, "ma-beaute-demo")) return;
  const photo = async (file: string, from: string, to: string) => {
    const dir = process.env.DEMO_PHOTOS_DIR;
    const path = dir ? join(dir, file) : "";
    return path && existsSync(path) ? new Uint8Array(readFileSync(path)) : demoImage(from, to);
  };
  const { tenant, business: laila } = await createTenant(tx, {
    name: "Ma Beauté Institut",
    slug: "ma-beaute-demo",
    planCode: "serenite",
    managerEmail: "laila@ma-beaute-demo.test",
    managerName: "Laïla",
    phone: "06 52 17 06 08",
  });
  const id = tenant.id;
  await updateIdentity(tx, id, {
    name: "Ma Beauté Institut",
    slug: "ma-beaute-demo",
    phone: "06 52 17 06 08",
    email: "contact@ma-beaute-demo.test",
    addressLine1: "458 avenue des Vertes Rives",
    postalCode: "84140",
    city: "Avignon-Montfavet",
    country: "FR",
    timezone: "Europe/Paris",
  });
  await updateAppearance(tx, id, {
    templateKey: "atelier",
    theme: "blush",
    primary: "#a0545a",
    secondary: "#f1d6d4",
  });
  await updateSocial(tx, id, {
    instagram: "https://www.instagram.com/",
    facebook: "https://www.facebook.com/",
  });
  const logoPath = process.env.DEMO_PHOTOS_DIR ? join(process.env.DEMO_PHOTOS_DIR, "logo.png") : "";
  if (logoPath && existsSync(logoPath)) {
    await uploadLogo(tx, storage, id, new Uint8Array(readFileSync(logoPath)), null);
  }
  const lailaPhoto = await uploadAsset(tx, storage, id, {
    bytes: await photo("laila.jpg", "#e9c4c2", "#f8ecea"),
    kind: "cover",
    uploadedByUserId: null,
    alt: "La cabine de Laïla",
  });
  const natachaPhoto = await uploadAsset(tx, storage, id, {
    bytes: await photo("natacha.jpg", "#6b4a42", "#d9c3bb"),
    kind: "gallery",
    uploadedByUserId: null,
    alt: "La cabine de massage de Natacha",
  });
  await uploadAsset(tx, storage, id, {
    bytes: await photo("facade.jpg", "#e2b77a", "#f4e3c4"),
    kind: "gallery",
    uploadedByUserId: null,
    alt: "L'entrée de l'institut",
  });
  await updatePage(tx, id, {
    pageKey: "home",
    texts: {
      badge: "Institut de beauté à Avignon-Montfavet",
      tagline: "Beauté et bien-être,",
      taglineAccent: "dans un même lieu.",
      intro:
        "Soins du visage, beauté du regard, épilation, onglerie et massages. Réservez votre moment en ligne, à toute heure.",
      highlight1Value: "+ 3 ans",
      highlight1Label: "à votre service",
      highlight2Value: "Qualiopi",
      highlight2Label: "Formations certifiées",
    },
    photoAssetId: lailaPhoto.id,
  });
  await updatePage(tx, id, {
    pageKey: "about",
    texts: {
      title: "L'institut",
      body: "Ma Beauté Institut réunit deux professionnelles : Laïla, spécialiste de la beauté du regard et des soins esthétiques, et Natacha, pour les massages.\nChacune vous reçoit dans sa propre cabine, sur rendez-vous.",
    },
    photoAssetId: natachaPhoto.id,
  });
  await updatePage(tx, id, {
    pageKey: "practical",
    texts: { access: "Espace médical, 1er étage. Parking à l'arrière." },
  });
  await updatePage(tx, id, { pageKey: "legal", texts: { credit: "Design by Johane A." } });

  await updateBusiness(tx, id, laila.id, { name: "Laïla", phone: "06 52 17 06 08" });
  await updateBusinessProfile(tx, id, laila.id, {
    slug: "laila",
    title: "Esthétique",
    role: "Esthéticienne, spécialiste du regard",
    bio: "Formée aux techniques les plus récentes, Laïla prend soin de votre regard, de votre visage et de votre peau.",
    availability: "Du lundi au samedi",
    photoAssetId: lailaPhoto.id,
  });
  const { business: natacha } = await createBusiness(tx, id, {
    name: "Natacha",
    phone: "06 12 01 73 85",
    managerEmail: "natacha@ma-beaute-demo.test",
    managerName: "Natacha",
  });
  await updateBusinessProfile(tx, id, natacha.id, {
    slug: "natacha",
    title: "Massages",
    role: "Praticienne en massage et soins du corps",
    bio: "Natacha prend le temps de vous écouter pour adapter chaque massage à vos besoins du moment.",
    availability: "Sur rendez-vous",
    photoAssetId: natachaPhoto.id,
  });

  const hours = [
    ...weekHours([1, 2, 3, 5], [["09:00", "19:00"]]),
    ...weekHours([4], [["09:30", "19:00"]]),
    ...weekHours([6], [["10:00", "20:00"]]),
  ];
  type Item = readonly [name: string, minutes: number, price: string, online?: boolean];
  type Category = {
    name: string;
    icon: CategoryIcon;
    description?: string;
    featured?: boolean;
    items: Item[];
  };
  const catalog: [string, string, Category[]][] = [
    [
      laila.id,
      "Laïla",
      [
        {
          name: "Beauté du regard",
          icon: "eye",
          featured: true,
          description: "Notre spécialité : réhaussement de cils, browlift, teinture.",
          items: [
            ["Réhaussement de cils, teinture offerte", 60, "55"],
            ["Browlift sans teinture", 35, "45"],
            ["Browlift avec teinture", 45, "50"],
            ["Browlift et restructuration des sourcils", 70, "55"],
          ],
        },
        {
          name: "Soins du visage",
          icon: "sparkles",
          description: "Éclat, hydratation, lifting.",
          items: [["Soin coup d'éclat", 60, "50"]],
        },
        {
          name: "Épilation",
          icon: "leaf",
          description: "Au fil ou à la cire, visage et corps.",
          items: [["Épilation des sourcils", 15, "12"]],
        },
        {
          name: "Formations",
          icon: "graduation",
          description: "Formations professionnelles certifiées Qualiopi.",
          items: [["Réhaussement de cils et browlift (formation, 1 journée)", 420, "900", false]],
        },
      ],
    ],
    [
      natacha.id,
      "Natacha",
      [
        {
          name: "Massages et soins du corps",
          icon: "drop",
          featured: true,
          description: "Deep tissue, aromathérapie, soin du dos : un moment adapté à vos besoins.",
          items: [
            ["Deep tissue, massage musculaire", 30, "55"],
            ["Soin purifiant du dos", 60, "60"],
            ["Aromathérapie, relaxation profonde", 60, "60"],
            ["Deep tissue, massage musculaire", 60, "65"],
            ["Deep tissue, massage musculaire", 90, "80"],
          ],
        },
        {
          name: "Madérothérapie et drainage lymphatique",
          icon: "waves",
          description: "Bras, ventre, jambes ou corps complet.",
          items: [["Madérothérapie des jambes", 45, "45"]],
        },
      ],
    ],
  ];
  for (const [business, staff, categories] of catalog) {
    await declareBusiness(tx, business);
    await replaceOpeningHours(tx, id, hours);
    const serviceIds: string[] = [];
    for (const category of categories) {
      const saved = await saveCategory(tx, id, {
        name: category.name,
        description: category.description,
        icon: category.icon,
        isFeatured: category.featured ?? false,
      });
      for (const [name, minutes, price, online = true] of category.items) {
        const service = await saveService(tx, id, {
          categoryId: saved.id,
          name,
          durationMinutes: minutes,
          price,
          isOnlineBookable: online,
        });
        if (online) serviceIds.push(service.id);
      }
    }
    await saveStaff(tx, id, { name: staff, serviceIds });
  }
  // Étape 9 bis : une promotion en cours chez Laïla, cartes cadeaux proposées (avec un compte Stripe actif).
  await declareBusiness(tx, laila.id);
  const browlifts = (await listServices(tx, id)).filter((service) => service.name.fr?.startsWith("Browlift"));
  const today = new Date().toISOString().slice(0, 10);
  const inThreeWeeks = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
  await savePromotion(tx, id, {
    title: "Offre d'automne",
    serviceIds: browlifts.map((service) => service.id),
    discountType: "percent",
    discountValue: "20",
    startsOn: today,
    endsOn: inThreeWeeks,
  });
  await updateGiftCardSettings(tx, id, {
    enabled: true,
    validityMonths: 12,
    amounts: "30, 50, 100",
    min: "10",
    max: "500",
  });
  await declareBusiness(tx, null);
  await changeStatus(tx, id, "activate");
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Démo interdite en production.");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas définie (voir .env.example).");
  const database = createDb(url);
  try {
    await database.transaction(async (tx) => {
      await seedBasic(tx);
      await seedFull(tx);
      await seedDuo(tx);
      await seedAtelier(tx);
    });
    console.log(
      "Démos prêtes : http://institut-demo.localhost:3000 (Basic), http://spa-demo.localhost:3000 (Sérénité), http://duo-demo.localhost:3000 (deux entreprises) et http://ma-beaute-demo.localhost:3000 (modèle Atelier)",
    );
  } finally {
    await database.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
