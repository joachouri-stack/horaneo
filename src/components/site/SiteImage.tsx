import Image from "next/image";
import { storage } from "@/lib/storage";
import type { SiteImage as SiteImageData } from "@/modules/site/data";

/**
 * Photo d'un site client : servie dans la bonne taille selon l'écran
 * (formats AVIF/WebP), avec ses dimensions pour éviter les décalages à l'affichage.
 */
export function SiteImage({
  image,
  sizes,
  priority = false,
  className,
  alt,
}: {
  image: SiteImageData;
  sizes: string;
  priority?: boolean;
  className?: string;
  alt?: string;
}) {
  return (
    <Image
      src={storage().publicUrl(image.key)}
      alt={alt ?? image.alt}
      width={image.width ?? 1200}
      height={image.height ?? 800}
      sizes={sizes}
      priority={priority}
      className={className}
    />
  );
}
