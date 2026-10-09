import { ctaLabelKey, siteCta } from "@/modules/site/cta";
import { getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/format";
import type { SiteData, SiteImage as SiteImageData } from "@/modules/site/data";
import { heroSecondPhoto, institutePhotos, siteReviews, visibleSections } from "@/modules/site/data";
import { openDaysSpan } from "@/modules/site/format";
import { businessPath, categoryPath, SITE_PATHS } from "@/modules/site/paths";
import { GoogleReviewCards, ReviewsSummary, Stars } from "../GoogleReviews";
import { SiteImage } from "../SiteImage";
import { CategoryGrid } from "./CategoryGrid";
import { InstitutePhotos } from "./InstitutePhotos";
import { presentedBusinesses, ProfessionalCards } from "./ProfessionalCards";
import { PillLink, SectionTitle } from "./ui";

type Site = NonNullable<SiteData>;

/** Accueil du modèle Atelier (institut, une ou plusieurs professionnelles). */
export async function AtelierHome({ site }: { site: Site }) {
  const t = await getTranslations("site.atelier");
  const tSite = await getTranslations("site");
  const tDays = await getTranslations("weekdays");
  const home = site.pages.home;
  const texts = home?.texts ?? {};
  const sections = visibleSections(site);
  const money = (cents: number) => formatMoney(cents, site.tenant.currency, site.locale);
  const secondPhoto = heroSecondPhoto(site);
  const span = openDaysSpan(site.openingHours);
  const pageOf = (businessId: string) => site.businesses.find((business) => business.id === businessId)?.slug;
  const presented = presentedBusinesses(site);

  // Réservation coupée : « Appeler » ou « Nous écrire » à la place de « Réserver ».
  const cta = siteCta(site);
  const ctaLabel = (bookLabel: string) =>
    cta?.kind === "book" ? bookLabel : cta ? tSite(ctaLabelKey(cta)) : "";
  const reviews = siteReviews(site);
  const showReviews =
    sections.testimonials && (site.testimonials.length > 0 || (reviews?.reviews.length ?? 0) > 0);
  const tReviews = await getTranslations("site.reviews");
  const giftCards = site.giftCardBusinessIds.length > 0;
  const tGift = await getTranslations("site.giftCard");
  const giftAmounts = [3000, 5000, 10000];

  // « Sur rendez-vous », et les jours d'ouverture : posé sur les photos de l'accroche.
  const appointmentNote = (
    <>
      <strong className="block">{t("byAppointment")}</strong>
      {span && (
        <span className="text-site-muted">
          {t("daysSpan", {
            from: tDays(String(span.from) as "1").toLowerCase(),
            to: tDays(String(span.to) as "1").toLowerCase(),
          })}
        </span>
      )}
    </>
  );

  return (
    <main id="contenu" className="overflow-x-clip">
      {/* ─── Accroche ─── */}
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pt-16">
        <div>
          {texts.badge && (
            <p className="inline-flex items-center gap-2 rounded-full bg-site-card px-3 py-1.5 text-xs font-semibold shadow-sm">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-site-accent" />
              {texts.badge}
            </p>
          )}
          <h1 className="mt-6 font-site-display text-[2.6rem] leading-[1.02] font-medium sm:text-6xl lg:text-7xl">
            {texts.tagline || site.tenant.name}
            {texts.taglineAccent && (
              <>
                <br />
                <em className="font-medium text-site-accent">{texts.taglineAccent}</em>
              </>
            )}
          </h1>
          {/* Téléphone et tablette : les photos juste sous le titre, visibles dès l'arrivée. */}
          {home?.photo && (
            <HeroPhotos
              photo={home.photo}
              second={secondPhoto}
              note={appointmentNote}
              className="mt-6 max-w-[22rem] pb-6 pl-5 lg:hidden"
              noteClassName="bottom-10 right-2 text-xs"
              aspect="aspect-[4/3]"
              // Même valeur que sur ordinateur : une seule image téléchargée, quelle que soit la version affichée.
              sizes="(min-width: 1024px) 40vw, 90vw"
            />
          )}
          {texts.intro && (
            <p className="mt-6 max-w-xl whitespace-pre-line text-lg leading-relaxed text-site-muted">
              {texts.intro}
            </p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            {/* Téléphone : la barre fixe du bas propose déjà « Réserver » ; pas de doublon ici. */}
            {cta && (
              <PillLink href={cta.href} size="lg" className="max-sm:hidden">
                {ctaLabel(t("bookMoment"))}
              </PillLink>
            )}
            <PillLink href="#soins" variant="outline" size="lg">
              {t("seeAllServices")}
            </PillLink>
          </div>
          {/* Note Google : une seule ligne discrète sous les boutons. */}
          {reviews?.rating != null && (
            <a
              href={reviews.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm text-site-muted hover:text-site-text"
            >
              <Stars rating={reviews.rating} />
              <strong className="text-site-text">
                {new Intl.NumberFormat(site.locale, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                }).format(reviews.rating)}
              </strong>
              <span>· {tReviews("short", { count: reviews.total })}</span>
            </a>
          )}
        </div>

        {home?.photo && (
          <HeroPhotos
            photo={home.photo}
            second={secondPhoto}
            note={appointmentNote}
            className="max-w-xl pb-10 pl-6 max-lg:hidden sm:pl-10"
            noteClassName="bottom-16 right-2 text-sm sm:right-4"
            aspect="aspect-[4/5]"
            sizes="(min-width: 1024px) 40vw, 90vw"
          />
        )}
      </section>

      {/* ─── Bandeau des soins ─── */}
      {site.categories.length > 0 && (
        <div className="overflow-hidden bg-site-text py-4 text-site-bg" aria-hidden="true">
          <div className="flex w-max animate-[marquee_40s_linear_infinite] whitespace-nowrap font-site-display text-2xl italic motion-reduce:animate-none">
            {[0, 1].map((copy) => (
              <span key={copy} className="flex gap-10 pr-10">
                {site.categories.map((category) => (
                  <span key={category.id} className="flex items-center gap-10">
                    {category.name}
                    <span className="text-base not-italic opacity-60">•</span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ─── Catégories ─── */}
      {site.categories.length > 0 && (
        <section
          id="soins"
          aria-labelledby="titre-soins"
          className="mx-auto max-w-7xl scroll-mt-24 px-4 pb-10 pt-16 sm:px-8 lg:pb-12 lg:pt-20"
        >
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <SectionTitle id="titre-soins" start={t("servicesTitle")} accent={t("servicesTitleAccent")} />
              <p className="mt-3 text-site-muted">{t("servicesIntro")}</p>
            </div>
          </div>
          <CategoryGrid
            labels={{ see: t("seeServices"), speciality: t("speciality"), choose: t("chooseProQuestion") }}
            groups={site.businesses
              .filter((business) => site.categories.some((category) => category.businessId === business.id))
              .map((business) => ({
                id: business.id,
                name: business.name,
                subtitle: business.title ?? "",
                initial: business.name.charAt(0),
                avatar: business.photo ? (
                  <SiteImage
                    image={business.photo}
                    alt=""
                    sizes="56px"
                    className="h-full w-full object-cover"
                  />
                ) : null,
              }))}
            cards={site.categories.map((category) => {
              const slug = pageOf(category.businessId);
              const bookable = category.services.some((service) => service.isOnlineBookable);
              return {
                id: category.id,
                name: category.name,
                description: category.description,
                icon: category.icon,
                featured: category.isFeatured,
                businessId: category.businessId,
                // Les cartes sont déjà rangées sous le nom de la professionnelle.
                withLabel: "",
                servicesLabel: t("servicesCount", { count: category.services.length }),
                ariaLabel: t("seeCategory", { category: category.name }),
                priceLabel: bookable ? t("from", { price: money(category.minPriceCents) }) : t("onRequest"),
                href: category.isTraining
                  ? categoryPath(category.slug)
                  : slug
                    ? `${businessPath(slug)}#${category.slug}`
                    : `${SITE_PATHS.services}`,
              };
            })}
          />
        </section>
      )}

      {/* ─── Les professionnelles ─── */}
      {presented.length > 0 && (
        <section
          aria-labelledby="titre-equipe"
          className="reveal rounded-[2.5rem] bg-site-card py-12 lg:py-16"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-8">
            <SectionTitle
              id="titre-equipe"
              start={t("teamTitle", { count: presented.length })}
              accent={t("teamTitleAccent")}
              breakLine
            />
            <ProfessionalCards site={site} businesses={presented} />
          </div>
        </section>
      )}

      {/* ─── L'institut ─── */}
      {sections.about && site.pages.about?.texts.body && (
        <section aria-labelledby="titre-institut" className="reveal bg-site-bg py-12 lg:py-16">
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 sm:px-8 lg:grid-cols-2 lg:gap-12">
            <InstitutePhotos photos={institutePhotos(site)} />
            <div className="relative">
              {/* Empreinte du logo, très légère, derrière le texte. */}
              {site.logo && (
                <SiteImage
                  image={site.logo}
                  alt=""
                  sizes="320px"
                  className="pointer-events-none absolute -right-4 -top-16 h-72 w-72 select-none rounded-full object-cover opacity-[0.08] mix-blend-multiply"
                />
              )}
              <div className="relative">
                <SectionTitle id="titre-institut" start={site.pages.about.texts.title || t("aboutTitle")} />
              </div>
              <p className="relative mt-5 whitespace-pre-line leading-relaxed text-site-muted">
                {site.pages.about.texts.body}
              </p>
              {cta && (
                <PillLink href={cta.href} className="relative mt-8">
                  {ctaLabel(t("takeAppointment"))}
                </PillLink>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ─── Carte cadeau ─── */}
      {giftCards && (
        <section aria-labelledby="titre-cadeau" className="reveal mx-auto max-w-7xl px-4 py-16 sm:px-8">
          <div className="grid items-center gap-10 overflow-hidden rounded-[2rem] bg-site-surface p-8 sm:p-12 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <SectionTitle
                id="titre-cadeau"
                start={tGift("sectionTitle")}
                accent={tGift("sectionAccent")}
                breakLine
              />
              <p className="mt-4 max-w-lg text-site-muted">{tGift("sectionText")}</p>
              <PillLink href={SITE_PATHS.giftCard} className="mt-7">
                {tGift("sectionCta")}
              </PillLink>
            </div>
            <div
              aria-hidden="true"
              className="mx-auto w-full max-w-sm rotate-[-4deg] rounded-[1.5rem] bg-site-text p-7 text-site-bg shadow-2xl"
            >
              <p className="font-site-display text-2xl">{site.tenant.name}</p>
              <p className="mt-8 text-xs uppercase tracking-widest opacity-70">{tGift("cardLabel")}</p>
              <p className="font-site-display text-5xl">{money(giftAmounts[1])}</p>
              <div className="mt-5 flex gap-2 text-xs">
                {giftAmounts.map((amount, index) => (
                  <span
                    key={amount}
                    className={`rounded-full border border-current/40 px-3 py-1 ${index === 1 ? "bg-site-bg text-site-text" : ""}`}
                  >
                    {money(amount)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─── Avis : seulement s'il y a des avis à lire (la note seule est déjà en haut de page) ─── */}
      {showReviews && (
        <section aria-labelledby="titre-avis" className="reveal bg-site-surface py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-8">
            <h2 id="titre-avis" className="text-center font-site-display text-4xl font-medium sm:text-5xl">
              {t("testimonialsTitle")}
            </h2>
            {reviews && <ReviewsSummary reviews={reviews} locale={site.locale} className="mt-4" />}
            <div className="mt-10 space-y-8">
              {reviews && <GoogleReviewCards reviews={reviews} />}
              {site.testimonials.length > 0 && (
                <ul className="relative flex snap-x gap-5 overflow-x-auto pb-4">
                  {site.testimonials.map((item) => (
                    <li key={item.id} className="w-[85%] shrink-0 snap-start sm:w-[23rem]">
                      <figure className="flex h-full flex-col rounded-[1.5rem] bg-site-card p-6">
                        <span
                          aria-hidden="true"
                          className="font-site-display text-4xl leading-none text-site-accent"
                        >
                          “
                        </span>
                        <blockquote className="mt-2 flex-1 whitespace-pre-line">{item.text}</blockquote>
                        <figcaption className="mt-4 text-sm font-semibold">
                          {item.rating && (
                            <span
                              className="mr-2 text-[#d9a441]"
                              aria-label={tSite("testimonials.rating", { rating: item.rating })}
                            >
                              <span aria-hidden="true">{"★".repeat(item.rating)}</span>
                            </span>
                          )}
                          {item.authorName}
                        </figcaption>
                      </figure>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ─── Réservation (horaires et adresse : dans le pied de page) ─── */}
      <section aria-labelledby="titre-reserver" className="mx-auto max-w-7xl px-4 py-20 sm:px-8">
        {/* Dans la couleur des boutons du site (et non foncé) : il ne se confond pas avec le pied de page. */}
        <div className="relative flex flex-col justify-center overflow-hidden rounded-[1.75rem] bg-site-button p-8 text-site-on-button sm:p-12">
          {site.logo ? (
            // Le logo en filigrane, sous le texte (le blanc du logo se fond dans la couleur du bloc).
            <SiteImage
              image={site.logo}
              alt=""
              sizes="240px"
              className="pointer-events-none absolute -bottom-10 -right-8 h-56 w-56 select-none rounded-full object-cover opacity-30 mix-blend-multiply"
            />
          ) : (
            <>
              <span
                aria-hidden="true"
                className="absolute -right-12 -top-12 h-44 w-44 rounded-full border-[1.75rem] border-site-on-button/10"
              />
              <span
                aria-hidden="true"
                className="absolute -bottom-10 right-16 h-24 w-24 rounded-full bg-site-on-button/10"
              />
            </>
          )}
          <h2 id="titre-reserver" className="relative font-site-display text-4xl font-medium leading-tight">
            {t("ctaTitle")}
          </h2>
          <p className="relative mt-3 opacity-90">{t(cta?.kind === "book" ? "ctaText" : "ctaTextContact")}</p>
          {cta && (
            <PillLink href={cta.href} variant="light" className="relative mt-6 self-start">
              {tSite(ctaLabelKey(cta))}
            </PillLink>
          )}
        </div>
      </section>
    </main>
  );
}

/**
 * Photos de l'accroche : la photo de couverture en arche, la deuxième photo
 * en médaillon et la pastille « Sur rendez-vous ». Même composition sur
 * ordinateur (à droite du texte) et sur téléphone (sous le titre, en plus compact).
 */
function HeroPhotos({
  photo,
  second,
  note,
  className,
  noteClassName,
  aspect,
  sizes,
}: {
  photo: SiteImageData;
  second: SiteImageData | null;
  note: React.ReactNode;
  className: string;
  noteClassName: string;
  aspect: string;
  sizes: string;
}) {
  return (
    <div className={`relative mx-auto w-full ${className}`}>
      <div
        className="absolute right-0 top-0 h-[92%] w-[94%] rounded-t-full bg-site-surface"
        aria-hidden="true"
      />
      <div className="relative ml-auto w-[92%] overflow-hidden rounded-t-full rounded-b-[2rem] shadow-xl">
        <SiteImage
          image={photo}
          alt={photo.alt}
          sizes={sizes}
          priority
          className={`w-full object-cover ${aspect}`}
        />
      </div>
      {second && (
        <div className="absolute bottom-0 left-0 w-[38%] overflow-hidden rounded-[1.5rem] border-4 border-site-bg shadow-xl">
          <SiteImage
            image={second}
            alt={second.alt}
            sizes="(min-width: 640px) 220px, 40vw"
            className="aspect-[4/5] w-full object-cover"
          />
        </div>
      )}
      <p className={`absolute rounded-2xl bg-site-card/95 px-4 py-3 shadow-lg ${noteClassName}`}>{note}</p>
    </div>
  );
}
