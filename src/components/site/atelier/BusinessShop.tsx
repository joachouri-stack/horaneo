import type { SiteImage as SiteImageData } from "@/modules/site/data";
import { SiteImage } from "../SiteImage";

/** Logo rond et nom de boutique d'une professionnelle (s'ils sont renseignés). */
export function BusinessShop({
  business,
  className = "",
}: {
  business: { shopName: string | null; logo: SiteImageData | null };
  className?: string;
}) {
  if (!business.shopName && !business.logo) return null;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {business.logo && (
        <span className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-site-border bg-white">
          <SiteImage
            image={business.logo}
            alt={business.shopName ? "" : business.logo.alt}
            sizes="56px"
            className="h-full w-full object-contain"
          />
        </span>
      )}
      {business.shopName && (
        <p className="font-site-display text-xl font-medium italic text-site-accent">{business.shopName}</p>
      )}
    </div>
  );
}
