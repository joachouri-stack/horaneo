import { getTranslations } from "next-intl/server";
import { storage } from "@/lib/storage";
import type { SiteImage as SiteImageData } from "@/modules/site/data";
import { PhotoZoom } from "../PhotoZoom";
import { SiteImage } from "../SiteImage";

/** Les deux photos de « L'institut », décalées ; un clic les ouvre en grand, entières. */
export async function InstitutePhotos({
  photos,
  priority = false,
}: {
  photos: SiteImageData[];
  priority?: boolean;
}) {
  const t = await getTranslations("site.atelier");
  return (
    <div className="grid grid-cols-2 gap-4">
      {photos.map((photo, index) => (
        <PhotoZoom
          key={photo.key}
          src={storage().publicUrl(photo.key)}
          width={photo.width ?? 1200}
          height={photo.height ?? 1600}
          alt={photo.alt}
          openLabel={t("zoomPhoto")}
          closeLabel={t("closePhoto")}
          className={`rounded-[1.5rem] ${index === 1 ? "mt-10" : ""}`}
        >
          <SiteImage
            image={photo}
            alt={photo.alt}
            sizes="(min-width: 1024px) 25vw, 50vw"
            priority={priority && index === 0}
            className="aspect-[3/4] w-full object-cover"
          />
        </PhotoZoom>
      ))}
    </div>
  );
}
