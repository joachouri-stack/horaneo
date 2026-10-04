import "dotenv/config";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { createLocalStorage } from "@/lib/storage/local";
import { saveCategory, saveService } from "@/modules/catalog/services";
import { updatePage } from "@/modules/content/pages";
import { saveTestimonial } from "@/modules/content/testimonials";
import { uploadAsset, uploadLogo } from "@/modules/media/assets";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { changeStatus, updateAppearance, updateIdentity } from "@/modules/tenants/update";
import { createDb, type Transaction } from "./client";
import { tenants } from "./schema";

/**
 * Deux établissements de démonstration pour le développement local :
 * - http://institut-demo.localhost:3000 : pack Basic (fiche d'une page) ;
 * - http://spa-demo.localhost:3000 : pack Sérénité (site complet, ambiance nature).
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
  const { tenant } = await createTenant(tx, {
    name: "Institut Démo",
    slug: "institut-demo",
    planCode: "basic",
    managerEmail: "gerante@institut-demo.test",
    phone: "04 78 00 00 00",
  });
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
  const { tenant } = await createTenant(tx, {
    name: "Spa Démo Lyon",
    slug: "spa-demo",
    planCode: "serenite",
    managerEmail: "gerante@spa-demo.test",
    phone: "04 72 00 00 00",
  });
  const id = tenant.id;
  await updateIdentity(tx, id, {
    name: "Spa Démo Lyon",
    slug: "spa-demo",
    legalName: "Spa Démo SARL",
    siret: "123 456 789 00012",
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
    });
    console.log(
      "Démos prêtes : http://institut-demo.localhost:3000 (Basic) et http://spa-demo.localhost:3000 (Sérénité)",
    );
  } finally {
    await database.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
