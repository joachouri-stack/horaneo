import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { formatLongDate, formatTimeOf } from "@/components/booking/format";
import { BirthdayForm } from "@/components/site/account/BirthdayForm";
import { CustomerLogin } from "@/components/site/account/CustomerLogin";
import { DataRequests } from "@/components/site/account/DataRequests";
import { PageTitle } from "@/components/site/blocks";
import { withTenant } from "@/db/access";
import type { Locale } from "@/i18n/locales";
import { formatMoney } from "@/lib/format";
import { formatPhone } from "@/modules/phone";
import { formatDuration } from "@/modules/site/format";
import { customerSession } from "@/lib/site/customer-session";
import { getSite } from "@/lib/site/load";
import { knownBusinesses } from "@/modules/customer-space/auth";
import { loadBusinessSpace, type BusinessSpace } from "@/modules/customer-space/space";
import { appointmentCalendarPath, SITE_PATHS } from "@/modules/site/paths";
import { logoutAction } from "./actions";

// Espace personnel : jamais indexé.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

const card = "rounded-site border border-site-border bg-site-card p-5 sm:p-6";
const pill =
  "inline-flex min-h-11 items-center justify-center rounded-full px-5 font-semibold transition hover:-translate-y-0.5";

/**
 * Espace des clientes (/mes-rendez-vous) : connexion par lien ou code, puis
 * rendez-vous à venir, avantages (fidélité, cartes cadeaux) et historique, pour
 * chaque entreprise du site où la cliente est connue.
 */
export default async function CustomerSpacePage({ params }: PageProps<"/sites/[tenantId]/mes-rendez-vous">) {
  const { tenantId } = await params;
  const site = await getSite(tenantId);
  if (!site.features.customerSpace) notFound();
  const t = await getTranslations("site.account");
  const tBooking = await getTranslations("booking");
  const tServices = await getTranslations("site.services");
  const session = await customerSession(tenantId);

  if (!session) {
    return (
      <main id="contenu" className="mx-auto max-w-xl px-4 py-10 sm:py-14">
        <PageTitle title={t("title")} intro={t("loginIntro")} />
        <CustomerLogin />
        <p className="mt-6 text-sm text-site-muted">
          {t("optional")}{" "}
          <Link
            href={SITE_PATHS.booking}
            className="font-semibold text-site-accent underline underline-offset-4"
          >
            {t("book")}
          </Link>
        </p>
      </main>
    );
  }

  const locale = site.locale as Locale;
  const known = new Set(
    await withTenant(tenantId, (tx) => knownBusinesses(tx, tenantId, session), undefined, null),
  );
  // Une entreprise à la fois : ses données seules sont lisibles (règles de la base).
  const spaces: BusinessSpace[] = [];
  for (const business of site.businesses.filter((item) => known.has(item.id)))
    spaces.push(
      await withTenant(
        tenantId,
        (tx) => loadBusinessSpace(tx, tenantId, business.id, session, { locale }),
        undefined,
        business.id,
      ),
    );
  const multi = site.businesses.length > 1;
  const timezone = site.tenant.timezone;
  const date = (value: Date) => formatLongDate(value.toISOString(), locale, timezone);
  const time = (value: Date) => formatTimeOf(value.toISOString(), locale, timezone);
  const money = (cents: number, currency: string) => formatMoney(cents, currency, locale);
  // Chaque prestation suivie de sa durée (« Massage (1 h) »).
  const serviceNames = (item: { services: string[]; durations: number[] }) =>
    item.services
      .map((name, index) =>
        item.durations[index]
          ? tBooking("serviceDuration", {
              name,
              duration: formatDuration(
                (key, values) => tServices(key as "durationMinutes", values),
                item.durations[index],
              ),
            })
          : name,
      )
      .join(" + ");
  const phoneOf = (businessId: string) =>
    site.businesses.find((business) => business.id === businessId)?.phone ?? site.tenant.phone;
  const firstName = spaces.find((space) => space.contact)?.contact?.firstName;

  const upcoming = spaces
    .flatMap((space) =>
      space.upcoming.map((item) => ({
        ...item,
        businessName: space.businessName,
        businessId: space.businessId,
      })),
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = spaces
    .flatMap((space) =>
      space.past.map((item) => ({ ...item, businessName: space.businessName, businessId: space.businessId })),
    )
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  const perks = spaces.filter((space) => space.loyalty || (space.giftCards && space.giftCards.length > 0));
  const pending = [...new Set(spaces.flatMap((space) => space.pendingRequests))];
  // Entreprises qui souhaitent l'anniversaire de leurs clientes : la date se donne ou se change ici.
  const birthdays = spaces.filter((space) => space.birthday);

  const who = (item: { staffName: string; businessName: string }) =>
    [
      t("with", { name: item.staffName }),
      multi && item.businessName !== item.staffName ? t("at", { name: item.businessName }) : "",
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <main id="contenu" className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-site-muted">
            {firstName ? t("hello", { name: firstName }) : t("helloAnonymous")}
          </p>
          <h1 className="font-site-display text-4xl font-semibold text-site-heading sm:text-5xl">
            {t("title")}
          </h1>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-site-muted underline underline-offset-4"
          >
            {t("logout")}
          </button>
        </form>
      </div>

      {/* ─── À venir ─── */}
      <section aria-labelledby="a-venir" className="space-y-3">
        <h2 id="a-venir" className="font-site-display text-2xl font-semibold text-site-heading">
          {t("upcoming")}
        </h2>
        {upcoming.length === 0 && (
          <div className={card}>
            <p className="text-site-muted">{t("noUpcoming")}</p>
            <Link href={SITE_PATHS.booking} className={`${pill} mt-4 bg-site-button text-site-on-button`}>
              {t("book")}
            </Link>
          </div>
        )}
        {upcoming.map((item) => (
          <article key={item.id} className={card}>
            <p className="font-site-display text-2xl font-semibold first-letter:uppercase text-site-heading">
              {t("when", { date: date(item.startsAt), time: time(item.startsAt) })}
            </p>
            <p className="mt-1 font-semibold">{serviceNames(item)}</p>
            <p className="text-site-muted">{who(item)}</p>
            {item.beneficiaryName && (
              <p className="mt-2 inline-flex rounded-full bg-site-surface px-3 py-1 text-sm font-semibold text-site-accent">
                {t("for", { name: item.beneficiaryName })}
              </p>
            )}
            {item.depositPaidCents > 0 && (
              <p className="mt-2 text-sm">
                {t("depositPaid", { amount: money(item.depositPaidCents, item.currency) })}
              </p>
            )}
            <a
              href={appointmentCalendarPath(item.manageToken)}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-site-accent underline underline-offset-4"
            >
              {t("addToCalendar")}
            </a>
            <div className="mt-4 border-t border-site-border pt-4">
              {item.canModify ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`${SITE_PATHS.appointment}/${item.manageToken}`}
                    className={`${pill} bg-site-button text-site-on-button`}
                  >
                    {t("manage")}
                  </Link>
                  <span className="text-sm text-site-muted">
                    {t("freeUntil", { date: date(item.deadline), time: time(item.deadline) })}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-site-muted">
                  {t("tooLate")}{" "}
                  {phoneOf(item.businessId) && (
                    <a
                      href={`tel:${phoneOf(item.businessId)}`}
                      className="inline-flex min-h-11 items-center font-semibold text-site-accent underline underline-offset-4"
                    >
                      {formatPhone(phoneOf(item.businessId)!)}
                    </a>
                  )}
                </p>
              )}
            </div>
          </article>
        ))}
      </section>

      {/* ─── Avantages : fidélité et cartes cadeaux, entreprise par entreprise ─── */}
      {perks.length > 0 && (
        <section aria-labelledby="avantages" className="mt-10 space-y-3">
          <h2 id="avantages" className="font-site-display text-2xl font-semibold text-site-heading">
            {t("perks")}
          </h2>
          {perks.map((space) => (
            <div key={space.businessId} className="space-y-3">
              {multi && perks.length > 1 && (
                <h3 className="font-semibold text-site-muted">
                  {t("perksAt", { name: space.businessName })}
                </h3>
              )}
              {space.loyalty && (
                <div className={card}>
                  <p className="text-sm font-semibold uppercase tracking-wide text-site-muted">
                    {t("loyaltyTitle")}
                  </p>
                  {space.loyalty.reward ? (
                    <div className="mt-3 rounded-site border-2 border-dashed border-site-accent bg-site-surface p-4">
                      <p className="font-site-display text-xl font-semibold text-site-heading">
                        {t("rewardReady")}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-site-accent">
                        {space.loyalty.reward.label ||
                          (space.loyalty.reward.amountCents
                            ? t("rewardAmount", {
                                amount: money(space.loyalty.reward.amountCents, site.tenant.currency),
                              })
                            : "")}
                      </p>
                      <p className="mt-1 text-sm text-site-muted">
                        {t("rewardValid", { date: date(space.loyalty.reward.expiresAt) })} · {t("rewardHint")}
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="mt-2 text-lg font-semibold">
                        {t("loyaltyRemaining", {
                          count: space.loyalty.remaining,
                          reward:
                            space.loyalty.rewardLabel ||
                            (space.loyalty.rewardCents
                              ? t("rewardAmount", {
                                  amount: money(space.loyalty.rewardCents, site.tenant.currency),
                                })
                              : ""),
                        })}
                      </p>
                      <div
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={space.loyalty.visitsRequired}
                        aria-valuenow={space.loyalty.points}
                        aria-label={t("loyaltyTitle")}
                        className="mt-3 h-3 overflow-hidden rounded-full bg-site-surface"
                      >
                        <div
                          className="h-full rounded-full bg-site-button transition-[width] duration-700"
                          style={{
                            width: `${Math.min(100, (space.loyalty.points / space.loyalty.visitsRequired) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-sm text-site-muted">
                        {t("loyaltyProgress", {
                          points: space.loyalty.points,
                          required: space.loyalty.visitsRequired,
                        })}
                      </p>
                    </>
                  )}
                </div>
              )}
              {space.giftCards && space.giftCards.length > 0 && (
                <div className={card}>
                  <p className="text-sm font-semibold uppercase tracking-wide text-site-muted">
                    {t("giftCards")}
                  </p>
                  <ul className="mt-3 divide-y divide-site-border">
                    {space.giftCards.map((gift) => (
                      <li key={gift.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div>
                          {gift.code ? (
                            <p className="font-mono text-lg font-semibold tracking-wider">{gift.code}</p>
                          ) : (
                            <p className="font-semibold">
                              {gift.received
                                ? t("giftReceived")
                                : gift.recipientName
                                  ? t("giftOffered", { name: gift.recipientName })
                                  : t("giftOfferedNoName")}
                            </p>
                          )}
                          <p className="text-sm text-site-muted">
                            {gift.code && <>{gift.received ? t("giftReceived") : t("giftBought")} · </>}
                            {t("giftBalance", { amount: money(gift.balanceCents, gift.currency) })} ·{" "}
                            {gift.code || !gift.received
                              ? t("giftValid", { date: date(gift.expiresAt) })
                              : t("giftScheduled", { date: date(gift.sendAt) })}
                          </p>
                          {!gift.code && !gift.received && (
                            <p className="mt-1 text-sm text-site-muted">{t("giftHiddenCode")}</p>
                          )}
                        </div>
                        {gift.code && (
                          <Link
                            href={`${SITE_PATHS.booking}?avec=${space.businessId}&carte=${encodeURIComponent(gift.code)}`}
                            className={`${pill} border border-site-border text-site-text`}
                          >
                            {t("giftUse")}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ─── Historique ─── */}
      <section aria-labelledby="historique" className="mt-10 space-y-3">
        <h2 id="historique" className="font-site-display text-2xl font-semibold text-site-heading">
          {t("history")}
        </h2>
        {past.length === 0 ? (
          <p className="text-site-muted">{t("noHistory")}</p>
        ) : (
          <ul className={`${card} divide-y divide-site-border !py-1`}>
            {past.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="font-semibold">{serviceNames(item)}</p>
                  <p className="text-sm text-site-muted">
                    {date(item.startsAt)} · {who(item)}
                    {item.beneficiaryName && ` · ${t("for", { name: item.beneficiaryName })}`}
                  </p>
                  {item.status !== "attended" && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-site-muted">
                      {t(`status.${item.status as "no_show" | "confirmed"}`)}
                    </p>
                  )}
                </div>
                {item.rebook ? (
                  <Link
                    href={`${SITE_PATHS.booking}?prestation=${item.rebook.serviceId}${item.rebook.staffId ? `&membre=${item.rebook.staffId}` : ""}&reprise=1`}
                    className={`${pill} bg-site-surface text-site-accent`}
                  >
                    {t("rebook")}
                  </Link>
                ) : (
                  <Link
                    href={`${SITE_PATHS.booking}?avec=${item.businessId}`}
                    className={`${pill} border border-site-border text-site-text`}
                  >
                    {t("seeServices")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── Anniversaire ─── */}
      {birthdays.length > 0 && (
        <section aria-labelledby="anniversaire" className="mt-10 space-y-3">
          <h2 id="anniversaire" className="font-site-display text-2xl font-semibold text-site-heading">
            {t("birthdayTitle")}
          </h2>
          <p className="text-site-muted">{t("birthdayIntro")}</p>
          {birthdays.map((space) => (
            <div key={space.businessId} className={card}>
              <BirthdayForm
                businessId={space.businessId}
                locale={locale}
                month={space.birthday?.month ?? null}
                day={space.birthday?.day ?? null}
                label={multi && birthdays.length > 1 ? space.businessName : undefined}
              />
            </div>
          ))}
        </section>
      )}

      {/* ─── Données personnelles ─── */}
      <section aria-labelledby="donnees" className="mt-10 space-y-3">
        <h2 id="donnees" className="font-site-display text-2xl font-semibold text-site-heading">
          {t("data")}
        </h2>
        <p className="text-site-muted">{t("dataIntro")}</p>
        {pending.map((kind) => (
          <p key={kind} className="text-sm font-semibold text-site-accent">
            {t("dataPending", { kind: t(`dataKinds.${kind}`) })}
          </p>
        ))}
        <DataRequests />
      </section>
    </main>
  );
}
