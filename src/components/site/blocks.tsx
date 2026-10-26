import { getTranslations } from "next-intl/server";
import type { SiteData } from "@/modules/site/data";
import { SiteImage } from "./SiteImage";

type Site = NonNullable<SiteData>;

/** Titre de page d'un site client. */
export function PageTitle({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="mb-8">
      <h1 className="font-site-display text-4xl font-semibold text-site-heading sm:text-5xl">{title}</h1>
      {intro && <p className="mt-4 max-w-3xl whitespace-pre-line text-lg text-site-muted">{intro}</p>}
    </div>
  );
}

/** Texte saisi par l'administratrice : les retours à la ligne sont conservés. */
export function Prose({ text }: { text: string }) {
  return <div className="max-w-3xl whitespace-pre-line text-lg leading-relaxed text-site-text">{text}</div>;
}

export async function TeamGrid({ site }: { site: Site }) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {site.staff.map((member) => (
        <li key={member.id} className="rounded-site bg-site-panel p-5">
          {member.photo && (
            <SiteImage
              image={member.photo}
              alt={member.name}
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="mb-4 aspect-square w-full rounded-site object-cover"
            />
          )}
          <h3 className="font-site-display text-2xl font-semibold text-site-heading">{member.name}</h3>
          {member.bio && <p className="mt-2 whitespace-pre-line text-site-muted">{member.bio}</p>}
        </li>
      ))}
    </ul>
  );
}

export function GalleryGrid({ site, limit }: { site: Site; limit?: number }) {
  const photos = limit ? site.gallery.slice(0, limit) : site.gallery;
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {photos.map((photo, index) => (
        <li key={photo.key}>
          <SiteImage
            image={photo}
            sizes="(min-width: 768px) 33vw, 50vw"
            priority={index < 2}
            className="aspect-[4/3] w-full rounded-site object-cover"
          />
        </li>
      ))}
    </ul>
  );
}

export async function TestimonialList({ site, limit }: { site: Site; limit?: number }) {
  const t = await getTranslations("site.testimonials");
  const items = limit ? site.testimonials.slice(0, limit) : site.testimonials;
  return (
    <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.id}>
          <figure className="flex h-full flex-col rounded-[1.5rem] bg-site-panel p-6">
            <span aria-hidden="true" className="font-site-display text-5xl leading-none text-site-accent">
              “
            </span>
            <blockquote className="mt-1 flex-1 whitespace-pre-line text-site-text">{item.text}</blockquote>
            <figcaption className="mt-5 flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-site-accent text-sm font-semibold text-site-on-button"
              >
                {item.authorName.trim().charAt(0).toUpperCase()}
              </span>
              <span>
                <span className="block font-semibold text-site-text">{item.authorName}</span>
                {item.rating && (
                  <span className="text-site-accent" aria-label={t("rating", { rating: item.rating })}>
                    <span aria-hidden="true">
                      {"★".repeat(item.rating)}
                      {"☆".repeat(5 - item.rating)}
                    </span>
                  </span>
                )}
              </span>
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}
