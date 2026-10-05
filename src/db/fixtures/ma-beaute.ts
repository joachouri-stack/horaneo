import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import type { FileStorage } from "@/lib/storage/types";
import type { CategoryIcon } from "@/modules/catalog/icons";
import { saveCategory, saveService } from "@/modules/catalog/services";
import { updatePage } from "@/modules/content/pages";
import { createBusiness, updateBusiness, updateBusinessProfile } from "@/modules/businesses/businesses";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { saveStaff } from "@/modules/team/staff";
import { updateAppearance, updateIdentity } from "@/modules/tenants/update";
import { uploadAsset, uploadLogo } from "@/modules/media/assets";
import { declareBusiness } from "../access";
import type { Transaction } from "../client";
import { assets, businesses } from "../schema";

/**
 * Contenu du site de Ma Beauté Institut, repris de ses maquettes : identité,
 * textes, deux entreprises (Laïla, Natacha), catégories, prestations, horaires.
 * Utilisé par la démo locale et par la commande d'import en production
 * (src/db/import-ma-beaute.ts). Les photos et le logo s'ajoutent à part.
 */

const weekHours = (days: number[], ranges: [string, string][]) =>
  days.flatMap((weekday) => ranges.map(([opensAt, closesAt]) => ({ weekday, opensAt, closesAt })));

export const MA_BEAUTE_HOURS = [
  ...weekHours([1, 2, 3, 5], [["09:00", "19:00"]]),
  ...weekHours([4], [["09:30", "19:00"]]),
  ...weekHours([6], [["10:00", "20:00"]]),
];

type Item = readonly [name: string, minutes: number, price: string, online?: boolean];
type Category = { name: string; icon: CategoryIcon; description?: string; featured?: boolean; items: Item[] };

const LAILA_CATALOG: Category[] = [
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
];

const NATACHA_CATALOG: Category[] = [
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
];

export type MaBeauteOptions = {
  /** Entreprise principale du site (créée avec le site), qui devient celle de Laïla. */
  lailaBusinessId: string;
  /** Identité du site à conserver (adresse provisoire et e-mail de contact). */
  slug: string;
  contactEmail: string | null;
  /** Compte de gérante de Natacha (facultatif : à ajouter plus tard dans l'admin). */
  natachaEmail?: string;
  /** Photos déjà envoyées (démo) ; sinon les pages restent sans photo. */
  photos?: { laila?: string; natacha?: string };
};

export async function fillMaBeaute(tx: Transaction, tenantId: string, options: MaBeauteOptions) {
  const id = tenantId;
  await updateIdentity(tx, id, {
    name: "Ma Beauté Institut",
    slug: options.slug,
    phone: "06 52 17 06 08",
    email: options.contactEmail ?? undefined,
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
    photoAssetId: options.photos?.laila ?? null,
  });
  await updatePage(tx, id, {
    pageKey: "about",
    texts: {
      title: "L'institut",
      body: "Ma Beauté Institut réunit deux professionnelles : Laïla, spécialiste de la beauté du regard et des soins esthétiques, et Natacha, pour les massages.\nChacune vous reçoit dans sa propre cabine, sur rendez-vous.",
    },
    photoAssetId: options.photos?.natacha ?? null,
  });
  await updatePage(tx, id, {
    pageKey: "practical",
    texts: { access: "Espace médical, 1er étage. Parking à l'arrière." },
  });
  await updatePage(tx, id, { pageKey: "legal", texts: { credit: "Design by Johane A." } });

  const lailaId = options.lailaBusinessId;
  await updateBusiness(tx, id, lailaId, { name: "Laïla", phone: "06 52 17 06 08" });
  await updateBusinessProfile(tx, id, lailaId, {
    slug: "laila",
    title: "Esthétique",
    role: "Esthéticienne, spécialiste du regard",
    bio: "Formée aux techniques les plus récentes, Laïla prend soin de votre regard, de votre visage et de votre peau.",
    availability: "Du lundi au samedi",
    photoAssetId: options.photos?.laila ?? null,
  });
  const { business: natacha } = await createBusiness(tx, id, {
    name: "Natacha",
    phone: "06 12 01 73 85",
    ...(options.natachaEmail ? { managerEmail: options.natachaEmail, managerName: "Natacha" } : {}),
  });
  await updateBusinessProfile(tx, id, natacha.id, {
    slug: "natacha",
    title: "Massages",
    role: "Praticienne en massage et soins du corps",
    bio: "Natacha prend le temps de vous écouter pour adapter chaque massage à vos besoins du moment.",
    availability: "Sur rendez-vous",
    photoAssetId: options.photos?.natacha ?? null,
  });

  const catalog: [string, string, Category[]][] = [
    [lailaId, "Laïla", LAILA_CATALOG],
    [natacha.id, "Natacha", NATACHA_CATALOG],
  ];
  for (const [business, staff, categories] of catalog) {
    await declareBusiness(tx, business);
    await replaceOpeningHours(tx, id, MA_BEAUTE_HOURS);
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
  await declareBusiness(tx, null);
  return { lailaId, natachaId: natacha.id };
}

/** Photos et logo repris des maquettes (rangés à côté de ce fichier). */
const PHOTO_DIR = new URL("./ma-beaute/", import.meta.url);
const readPhoto = (file: string) => new Uint8Array(readFileSync(new URL(file, PHOTO_DIR)));

/**
 * Ajoute les photos et le logo des maquettes, aux mêmes places que la démo :
 * logo, accueil et page de Laïla (sa cabine), présentation et page de Natacha,
 * entrée de l'institut dans la galerie. Refuse un site qui a déjà des photos.
 */
export async function addMaBeautePhotos(tx: Transaction, store: FileStorage, tenantId: string) {
  const id = tenantId;
  const existing = await tx.select({ id: assets.id }).from(assets).where(eq(assets.tenantId, id));
  if (existing.length > 0) throw new Error("Ce site a déjà des photos : ajout annulé.");
  const siteBusinesses = await tx.select().from(businesses).where(eq(businesses.tenantId, id));
  const laila = siteBusinesses.find((business) => business.slug === "laila");
  const natacha = siteBusinesses.find((business) => business.slug === "natacha");
  if (!laila || !natacha) throw new Error("Importez d'abord le contenu (pnpm import:ma-beaute).");

  await uploadLogo(tx, store, id, readPhoto("logo.png"), null);
  const lailaPhoto = await uploadAsset(tx, store, id, {
    bytes: readPhoto("laila.jpg"),
    kind: "cover",
    uploadedByUserId: null,
    alt: "La cabine de Laïla",
  });
  const natachaPhoto = await uploadAsset(tx, store, id, {
    bytes: readPhoto("natacha.jpg"),
    kind: "gallery",
    uploadedByUserId: null,
    alt: "La cabine de massage de Natacha",
  });
  await uploadAsset(tx, store, id, {
    bytes: readPhoto("facade.jpg"),
    kind: "gallery",
    uploadedByUserId: null,
    alt: "L'entrée de l'institut",
  });
  await updatePage(tx, id, { pageKey: "home", texts: {}, photoAssetId: lailaPhoto.id });
  await updatePage(tx, id, { pageKey: "about", texts: {}, photoAssetId: natachaPhoto.id });
  // La photo seule : les textes de la page de chacune sont repris tels quels.
  for (const [business, photo] of [
    [laila, lailaPhoto.id],
    [natacha, natachaPhoto.id],
  ] as const) {
    const profile = business.profile ?? {};
    await updateBusinessProfile(tx, id, business.id, {
      slug: business.slug ?? undefined,
      title: profile.title?.fr,
      role: profile.role?.fr,
      bio: profile.bio?.fr,
      availability: profile.availability?.fr,
      photoAssetId: photo,
    });
  }
}
