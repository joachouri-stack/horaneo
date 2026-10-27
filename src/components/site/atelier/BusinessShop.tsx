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
    <div className={`flex items-center gap-4 ${className}`}>
      {business.logo && (
        <span className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-site-border bg-white p-1.5 shadow-sm sm:h-24 sm:w-24">
          <SiteImage
            image={business.logo}
            alt={business.shopName ? "" : business.logo.alt}
            sizes="96px"
            className="h-full w-full object-contain"
          />
        </span>
      )}
      {business.shopName && (
        <p className="font-site-display text-2xl font-medium italic leading-tight text-site-accent sm:text-3xl">
          {business.shopName}
        </p>
      )}
    </div>
  );
}
