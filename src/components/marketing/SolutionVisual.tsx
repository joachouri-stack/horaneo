import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { Solution } from "@/modules/billing/grid";
import {
  BagLine,
  BellLine,
  BoxLine,
  CalendarLine,
  CapLine,
  ChartLine,
  LockLine,
  PercentLine,
  PlayLine,
  StoreLine,
  TagLine,
  UsersLine,
} from "./line-icons";

/**
 * Aperçu de l'interface d'une solution : un ordinateur portable (tableau de
 * bord) et un téléphone (ce que voit le client), dessinés en HTML/CSS avec des
 * données d'exemple (traductions). Couleurs : accent de la solution.
 */
/** Photo de couverture d'une solution, à la place de l'aperçu dessiné (public/images). */
const COVERS: Partial<Record<Solution, { src: string; width: number; height: number }>> = {
  booking: { src: "/images/couverture-sirine.webp", width: 1536, height: 1024 },
};

export async function SolutionVisual({ solution }: { solution: Solution }) {
  const t = await getTranslations(`home.solutions.items.${solution}`);
  const tAll = await getTranslations("home.solutions");
  const cover = COVERS[solution];
  if (cover)
    return (
      // S'adapte à la largeur : pleine largeur sur téléphone et tablette, colonne de droite sur ordinateur.
      <Image
        src={cover.src}
        width={cover.width}
        height={cover.height}
        alt={tAll("visual", { solution: t("name") })}
        sizes="(min-width: 1024px) 40rem, 100vw"
        preload
        className="mx-auto h-auto w-full max-w-[40rem] rounded-[1.4rem] object-cover"
      />
    );
  const menu = t.raw("mock.menu") as string[];
  const events = t.raw("mock.events") as string[];
  // Boutique : noms de produits d'exemple (traductions) et petits libellés.
  const shop =
    solution === "commerce"
      ? {
          products: t.raw("mock.products") as string[],
          isNew: t("mock.new"),
          promo: t("mock.promo"),
          variants: t("mock.variants"),
        }
      : null;
  const FloatIcon = { booking: BellLine, commerce: LockLine, formation: UsersLine }[solution];
  // Pictogrammes du menu, dans l'ordre des libellés de chaque solution.
  const MenuIcons =
    solution === "commerce"
      ? [TagLine, BagLine, BoxLine, PercentLine, ChartLine]
      : [CalendarLine, UsersLine, StoreLine, CapLine, ChartLine];

  return (
    <div
      role="img"
      aria-label={tAll("visual", { solution: t("name") })}
      className="relative mx-auto aspect-[16/11] w-full max-w-[40rem]"
    >
      <div aria-hidden="true" className="absolute inset-0">
        {/* Halo doux derrière les appareils */}
        <div className="absolute left-[8%] top-[6%] h-[80%] w-[84%] rounded-[3rem] bg-accent-soft blur-2xl" />

        {/* Ordinateur portable */}
        <div className="absolute left-0 top-[8%] w-[84%]">
          <div className="rounded-t-[1rem] border border-[#d5d9e3] bg-[#1d2333] p-[1.2%] shadow-[0_30px_60px_-30px_rgba(15,24,48,.55)]">
            <div className="flex aspect-[16/10] overflow-hidden rounded-[0.55rem] bg-white">
              {/* Barre latérale */}
              <div className="flex w-[22%] flex-col gap-[3%] border-r border-hairline bg-mist-50 p-[3%]">
                <span className="mb-[6%] flex items-center gap-1.5">
                  <span className="size-[0.55rem] rounded-full bg-accent" />
                  <span className="h-[0.35rem] w-[55%] rounded-full bg-[#c9cfdc]" />
                </span>
                {menu.map((item, index) => {
                  const Icon = MenuIcons[index % MenuIcons.length];
                  return (
                    <span
                      key={item}
                      className={`flex items-center gap-1 rounded-md px-[6%] py-[4%] text-[clamp(0.35rem,0.9vw,0.55rem)] ${
                        index === 0 ? "bg-accent-soft font-medium text-accent-strong" : "text-ink-soft"
                      }`}
                    >
                      <Icon className="size-[0.6rem] flex-none" />
                      <span className="truncate">{item}</span>
                    </span>
                  );
                })}
              </div>
              {/* Contenu */}
              <div className="flex flex-1 flex-col p-[3%]">
                <div className="mb-[3%] flex items-center justify-between">
                  <span className="text-[clamp(0.45rem,1.1vw,0.7rem)] font-medium text-night">
                    {t("mock.today")}
                  </span>
                  <span className="rounded-full border border-hairline px-2 py-px text-[clamp(0.35rem,0.85vw,0.5rem)] text-ink-soft">
                    {t("mock.week")}
                  </span>
                </div>
                {solution === "booking" && <BookingScreen events={events} />}
                {shop && <CommerceScreen {...shop} />}
                {solution === "formation" && <FormationScreen events={events} />}
              </div>
            </div>
          </div>
          <div className="mx-auto h-[0.55rem] w-[108%] -translate-x-[3.7%] rounded-b-[0.9rem] bg-gradient-to-b from-[#d9dde6] to-[#b9bfcc]" />
        </div>

        {/* Téléphone */}
        <div className="hn-float-late absolute bottom-0 right-[2%] w-[27%] rounded-[1.6rem] border border-[#2a3043] bg-[#1d2333] p-[1.1%] shadow-[0_30px_50px_-20px_rgba(15,24,48,.6)]">
          <div className="flex aspect-[9/18.5] flex-col overflow-hidden rounded-[1.35rem] bg-white">
            <div className="mx-auto mt-[4%] h-[2.2%] w-[32%] rounded-full bg-[#1d2333]" />
            <div className="flex flex-1 flex-col gap-[3%] p-[8%]">
              <span className="text-[clamp(0.38rem,0.9vw,0.55rem)] text-ink-soft">{t("mock.business")}</span>
              <span className="text-[clamp(0.45rem,1.05vw,0.68rem)] font-medium leading-tight text-night">
                {t("mock.phoneTitle")}
              </span>
              {solution === "booking" && <PhoneBooking />}
              {shop && <PhoneCommerce {...shop} />}
              {solution === "formation" && <PhoneFormation events={events} />}
              <span className="mt-auto flex items-center justify-center gap-1 rounded-lg bg-accent py-[6%] text-center text-[clamp(0.38rem,0.9vw,0.55rem)] font-medium text-white">
                {shop && <BagLine className="size-[0.6rem]" />}
                {t("mock.phoneCta")}
              </span>
            </div>
          </div>
        </div>

        {/* Boutique : nouvelle commande reçue, stock mis à jour (à partir de la tablette : sur
            téléphone, la carte cacherait les produits). */}
        {shop && (
          <div className="hn-float-late absolute bottom-[6%] left-[3%] hidden items-center sm:flex gap-2.5 rounded-xl border border-hairline bg-white/95 px-3 py-2 shadow-[0_16px_30px_-18px_rgba(15,24,48,.45)] backdrop-blur">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-white">
              <BoxLine className="size-[18px]" />
            </span>
            <span className="leading-tight">
              <span className="block text-[0.72rem] font-medium text-night">{t("mock.orderTitle")}</span>
              <span className="block text-[0.65rem] text-ink-soft">{t("mock.orderText")}</span>
            </span>
          </div>
        )}

        {/* Carte flottante */}
        <div className="hn-float absolute right-[4%] top-0 flex items-center gap-2.5 rounded-xl border border-hairline bg-white/95 px-3 py-2 shadow-[0_16px_30px_-18px_rgba(15,24,48,.45)] backdrop-blur">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <FloatIcon className="size-[18px]" />
          </span>
          <span className="leading-tight">
            <span className="block text-[0.72rem] font-medium text-night">{t("floating.title")}</span>
            <span className="block text-[0.65rem] text-ink-soft">{t("floating.text")}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Semaine d'agenda : colonnes des jours, rendez-vous en blocs. */
function BookingScreen({ events }: { events: string[] }) {
  const blocks = [
    { col: 0, top: 8, h: 22 },
    { col: 1, top: 30, h: 18 },
    { col: 2, top: 14, h: 26 },
    { col: 3, top: 52, h: 20 },
    { col: 4, top: 24, h: 16 },
    { col: 1, top: 62, h: 16 },
    { col: 3, top: 10, h: 18 },
  ];
  return (
    <div className="relative grid flex-1 grid-cols-5 gap-[2%] rounded-lg border border-hairline p-[2%]">
      {Array.from({ length: 5 }, (_, col) => (
        <div key={col} className="relative rounded-md bg-mist-50">
          {blocks
            .filter((block) => block.col === col)
            .map((block, index) => (
              <span
                key={index}
                className={`absolute inset-x-[6%] overflow-hidden rounded-[0.3rem] border-l-2 px-[6%] py-[4%] text-[clamp(0.3rem,0.7vw,0.45rem)] leading-tight ${
                  index % 2 === 0
                    ? "border-accent bg-accent-soft text-accent-strong"
                    : "border-champagne bg-champagne-soft text-[#7b5d2a]"
                }`}
                style={{ top: `${block.top}%`, height: `${block.h}%` }}
              >
                {events[(col + index) % events.length]}
              </span>
            ))}
        </div>
      ))}
    </div>
  );
}

type Shop = { products: string[]; isNew: string; promo: string; variants: string };

/** Fonds doux des vignettes de produits (tons sable et rosé de la solution Commerce). */
const PRODUCT_TONES = [
  "from-[#f6ebdc] to-[#ead6bb]",
  "from-[#f3e6e1] to-[#e6cfc6]",
  "from-[#eef0e6] to-[#d9dec8]",
  "from-[#f5eee4] to-[#e4d3bc]",
  "from-[#efe7ef] to-[#dccbdb]",
  "from-[#f4ece2] to-[#e2cdb4]",
];

/** Silhouettes de produits (flacon, pot, bougie, tube, sac, coffret), dessinées en SVG. */
function ProductShape({ index }: { index: number }) {
  const shapes = [
    // Flacon compte-gouttes
    <g key="0">
      <rect x="40" y="18" width="20" height="14" rx="4" fill="#8a6a4a" />
      <rect x="32" y="32" width="36" height="52" rx="10" fill="#fffaf3" />
      <rect x="38" y="50" width="24" height="16" rx="3" fill="#ecdcc4" />
    </g>,
    // Pot de crème
    <g key="1">
      <rect x="26" y="40" width="48" height="12" rx="4" fill="#b98f72" />
      <rect x="28" y="50" width="44" height="32" rx="8" fill="#fffaf3" />
      <rect x="36" y="60" width="28" height="10" rx="3" fill="#ead2c6" />
    </g>,
    // Bougie
    <g key="2">
      <path d="M50 18c5 7 5 12 0 15-5-3-5-8 0-15z" fill="#e3a857" />
      <rect x="49" y="32" width="2" height="8" fill="#5b4a3a" />
      <rect x="30" y="40" width="40" height="44" rx="8" fill="#fffaf3" />
      <rect x="30" y="58" width="40" height="10" fill="#d9dec8" />
    </g>,
    // Tube
    <g key="3">
      <rect x="42" y="72" width="16" height="12" rx="3" fill="#8a6a4a" />
      <path d="M34 20h32l-4 52H38z" fill="#fffaf3" />
      <rect x="40" y="36" width="20" height="18" rx="3" fill="#ecdcc4" />
    </g>,
    // Sac
    <g key="4">
      <path d="M40 36v-6a10 10 0 0 1 20 0v6" fill="none" stroke="#8a6a4a" strokeWidth="3" />
      <path d="M28 36h44l-4 48H32z" fill="#fffaf3" />
      <rect x="40" y="52" width="20" height="12" rx="3" fill="#dccbdb" />
    </g>,
    // Coffret
    <g key="5">
      <rect x="24" y="40" width="52" height="42" rx="6" fill="#fffaf3" />
      <rect x="22" y="32" width="56" height="12" rx="4" fill="#ecdcc4" />
      <rect x="47" y="32" width="6" height="50" fill="#c79a62" />
    </g>,
  ];
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 m-auto h-[82%] w-[82%] drop-shadow-sm">
      {shapes[index % shapes.length]}
    </svg>
  );
}

/** Boutique : vignettes de produits d'exemple, étiquettes « Nouveau » et promotion (prix masqués). */
function CommerceScreen({ products, isNew, promo }: Shop) {
  return (
    <div className="grid flex-1 grid-cols-3 gap-[3%]">
      {products.slice(0, 6).map((name, index) => (
        <div
          key={name}
          className="flex flex-col rounded-lg border border-hairline bg-white p-[5%] shadow-[0_6px_14px_-12px_rgba(15,24,48,.45)]"
        >
          <div
            className={`relative flex-1 overflow-hidden rounded-md bg-gradient-to-br ${PRODUCT_TONES[index]}`}
          >
            <ProductShape index={index} />
            {(index === 0 || index === 4) && (
              <span className="absolute left-[6%] top-[8%] rounded-full bg-white/90 px-1.5 text-[clamp(0.28rem,0.65vw,0.42rem)] font-medium text-accent-strong">
                {index === 0 ? isNew : promo}
              </span>
            )}
          </div>
          <span className="mt-[6%] truncate text-[clamp(0.3rem,0.72vw,0.46rem)] font-medium text-night">
            {name}
          </span>
          <span className="mt-[5%] flex items-center justify-between">
            <span className="h-[0.28rem] w-[38%] rounded-full bg-accent/60" />
            <span className="flex size-[0.75rem] items-center justify-center rounded-full bg-accent-soft text-accent">
              <BagLine className="size-[0.45rem]" />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Formations : vignettes vidéo et progression. */
function FormationScreen({ events }: { events: string[] }) {
  return (
    <div className="grid flex-1 grid-cols-3 gap-[3%]">
      {[72, 40, 15].map((progress, index) => (
        <div key={index} className="flex flex-col rounded-lg border border-hairline p-[5%]">
          <div className="relative flex flex-1 items-center justify-center rounded-md bg-gradient-to-br from-accent-soft to-accent-line">
            <PlayLine className="size-[30%] text-accent" />
          </div>
          <span className="mt-[6%] truncate text-[clamp(0.3rem,0.7vw,0.45rem)] text-night">
            {events[index]}
          </span>
          <span className="mt-[5%] h-[0.25rem] rounded-full bg-mist-50">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function PhoneBooking() {
  return (
    <>
      <div className="grid grid-cols-5 gap-[6%] rounded-lg border border-hairline p-[6%]">
        {Array.from({ length: 15 }, (_, index) => (
          <span
            key={index}
            className={`aspect-square rounded-[0.25rem] ${
              index === 7 ? "bg-accent" : index % 4 === 1 ? "bg-[#eef0f4]" : "bg-accent-soft"
            }`}
          />
        ))}
      </div>
      {/* Créneaux du jour choisi */}
      <div className="grid grid-cols-3 gap-[5%]">
        {[0, 1, 2, 3, 4, 5].map((slot) => (
          <span
            key={slot}
            className={`h-[0.9rem] rounded-[0.3rem] border ${
              slot === 2 ? "border-accent bg-accent-soft" : "border-hairline"
            }`}
          />
        ))}
      </div>
    </>
  );
}

function PhoneCommerce({ products, variants }: Shop) {
  return (
    <>
      <div
        className={`relative aspect-square overflow-hidden rounded-lg bg-gradient-to-br ${PRODUCT_TONES[0]}`}
      >
        <ProductShape index={0} />
      </div>
      <span className="truncate text-[clamp(0.36rem,0.85vw,0.52rem)] font-medium text-night">
        {products[0]}
      </span>
      <span className="h-[0.3rem] w-[30%] rounded-full bg-accent/60" />
      {/* Variantes (couleurs ou parfums) */}
      <span className="flex items-center gap-[6%] text-[clamp(0.3rem,0.7vw,0.44rem)] text-ink-soft">
        {variants}
        {["#c9a27a", "#e6cfc6", "#d9dec8"].map((color, index) => (
          <span
            key={color}
            className={`size-[0.5rem] rounded-full ${index === 0 ? "ring-1 ring-accent ring-offset-1" : ""}`}
            style={{ background: color }}
          />
        ))}
      </span>
    </>
  );
}

function PhoneFormation({ events }: { events: string[] }) {
  return (
    <>
      <div className="flex aspect-video items-center justify-center rounded-lg bg-gradient-to-br from-accent-soft to-accent-line">
        <PlayLine className="size-[30%] text-accent" />
      </div>
      {events.slice(0, 3).map((item, index) => (
        <span
          key={item + index}
          className="flex items-center gap-1.5 text-[clamp(0.32rem,0.75vw,0.48rem)] text-night"
        >
          <span
            className={`size-[0.4rem] flex-none rounded-full ${index === 0 ? "bg-accent" : "bg-[#d5d9e3]"}`}
          />
          {item}
        </span>
      ))}
    </>
  );
}
