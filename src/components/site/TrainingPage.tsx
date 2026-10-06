import { getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/format";
import type { SiteCategory, SiteData } from "@/modules/site/data";
import { detailBlocks } from "@/modules/site/details";
import { formatDuration } from "@/modules/site/format";
import { CheckIcon } from "./atelier/icons";
import { PillLink, Tag } from "./atelier/ui";
import { SiteImage } from "./SiteImage";

type Site = NonNullable<SiteData>;

/**
 * Page d'une catégorie présentée comme une formation : accroche, l'essentiel
 * (durée, tarif, lieu, intervenante), programme, financement (logos) et contact.
 * Pas de liste de soins ni de réservation : on se renseigne, puis on s'inscrit.
 */
export async function TrainingPage({ site, category }: { site: Site; category: SiteCategory }) {
  const t = await getTranslations("site.training");
  const tServices = await getTranslations("site.services");
  const business = site.businesses.find((item) => item.id === category.businessId);
  const phone = business?.phone ?? site.tenant.phone;
  const email = business?.email ?? site.tenant.email;
  const blocks = detailBlocks(category.details);
  const paragraphs = blocks.flatMap((block) => (block.kind === "p" ? [block.text] : []));
  const programme = blocks.flatMap((block) => (block.kind === "ul" ? block.items : []));
  const duration = (minutes: number) =>
    formatDuration((key, values) => tServices(key as "durationMinutes", values), minutes);
  const mailto = (subject: string) =>
    email ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : null;
  const place = [site.tenant.name, site.tenant.city].filter(Boolean).join(", ");

  const contact = (subject: string, light = false) => (
    <div className="flex flex-wrap gap-3">
      {mailto(subject) && (
        <PillLink href={mailto(subject)!} variant={light ? "light" : "primary"}>
          {t("askInfo")}
        </PillLink>
      )}
      {phone && (
        <a
          href={`tel:${phone}`}
          className={`inline-flex min-h-12 items-center rounded-full border px-5 font-semibold transition hover:opacity-80 ${
            light ? "border-current/50" : "border-site-text"
          }`}
        >
          {t("call")}
        </a>
      )}
    </div>
  );

  return (
    <main id="contenu" className="overflow-x-clip">
      {/* ─── Accroche ─── */}
      <section className="mx-auto max-w-5xl px-4 pb-10 pt-10 sm:px-8 sm:pt-16">
        <Tag>{t("badge")}</Tag>
        <h1 className="mt-5 font-site-display text-[2.6rem] leading-[1.05] font-medium sm:text-6xl">
          {category.name}
        </h1>
        {category.description && (
          <p className="mt-5 max-w-2xl text-lg text-site-muted">{category.description}</p>
        )}
        {paragraphs.map((text) => (
          <p key={text} className="mt-3 max-w-2xl text-site-muted">
            {text}
          </p>
        ))}
        <div className="mt-8">{contact(t("mailSubject", { name: category.name }))}</div>
      </section>

      {/* ─── L'essentiel de chaque formation ─── */}
      <section aria-label={t("essentials")} className="mx-auto max-w-5xl space-y-5 px-4 sm:px-8">
        {category.services.map((service) => {
          const price = formatMoney(service.priceCents, service.currency, site.locale);
          const facts = [
            { label: t("duration"), value: duration(service.durationMinutes) },
            { label: t("price"), value: service.priceFrom ? tServices("priceFrom", { price }) : price },
            ...(place ? [{ label: t("place"), value: place }] : []),
            ...(business ? [{ label: t("with"), value: business.name }] : []),
          ];
          return (
            <article
              key={service.id}
              className="rounded-[1.75rem] border border-site-border bg-site-card p-5 sm:p-8"
            >
              {(() => {
                // « Nom (formation, 1 journée) » : la précision entre parenthèses devient une étiquette.
                const [, title, note] = service.name.match(/^(.+?)\s*\(([^()]+)\)\s*$/) ?? [
                  ,
                  service.name,
                  "",
                ];
                return (
                  <>
                    {note && <Tag>{note}</Tag>}
                    <h2
                      className={`font-site-display text-[1.75rem] leading-tight font-medium sm:text-3xl ${note ? "mt-3" : ""}`}
                    >
                      {title}
                    </h2>
                  </>
                );
              })()}
              {service.description && <p className="mt-2 text-site-muted">{service.description}</p>}
              {/* Téléphone : une liste « libellé · valeur » ; plus large : des tuiles. */}
              <dl className="mt-5 divide-y divide-site-border rounded-2xl bg-site-surface px-4 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-4 sm:divide-y-0 sm:bg-transparent sm:px-0 lg:grid-cols-4">
                {facts.map((fact) => (
                  <div
                    key={fact.label}
                    className="flex items-baseline justify-between gap-4 py-3 sm:block sm:rounded-2xl sm:bg-site-surface sm:p-4"
                  >
                    <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-site-muted">
                      {fact.label}
                    </dt>
                    <dd className="text-right font-semibold sm:mt-1 sm:text-left">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </section>

      {/* ─── Programme ─── */}
      {programme.length > 0 && (
        <section aria-labelledby="titre-programme" className="mx-auto max-w-5xl px-4 pt-16 sm:px-8">
          <h2 id="titre-programme" className="font-site-display text-4xl font-medium">
            {t("programme")}
          </h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {programme.map((item) => (
              <li key={item} className="flex gap-3 rounded-2xl bg-site-card p-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-site-button text-site-on-button">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── Financement ─── */}
      {category.logos.length > 0 && (
        <section aria-labelledby="titre-financement" className="mx-auto max-w-5xl px-4 pt-16 sm:px-8">
          <h2 id="titre-financement" className="font-site-display text-4xl font-medium">
            {t("fundingTitle")}
          </h2>
          <p className="mt-3 max-w-2xl text-site-muted">{t("fundingText")}</p>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-4">
            {category.logos.map((logo) => (
              <li
                key={logo.key}
                className="flex h-20 items-center justify-center rounded-2xl bg-white px-3 shadow-sm sm:h-24 sm:px-6"
              >
                <SiteImage
                  image={logo}
                  sizes="240px"
                  className="h-12 w-auto max-w-full object-contain sm:h-14 sm:max-w-[12rem]"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── S'inscrire ─── */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-8">
        <div className="relative overflow-hidden rounded-[1.75rem] bg-site-button p-8 text-site-on-button sm:p-10">
          <span
            aria-hidden="true"
            className="absolute -right-12 -top-12 h-44 w-44 rounded-full border-[1.75rem] border-site-on-button/10"
          />
          <h2 className="relative font-site-display text-4xl font-medium leading-tight">{t("ctaTitle")}</h2>
          <p className="relative mt-3 max-w-xl opacity-90">{t("ctaText")}</p>
          <div className="relative mt-6">{contact(t("mailSubject", { name: category.name }), true)}</div>
        </div>
      </section>
    </main>
  );
}
