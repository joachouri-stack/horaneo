import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, Section } from "@/components/admin/fields";
import { CopyLink } from "@/components/manager/CopyLink";
import { ui } from "@/components/ui/styles";
import { publicAppUrl } from "@/config/env";
import { calendarFeedToken } from "@/lib/calendar/feed-token";
import { managerPage } from "@/lib/manager/page";
import { calendarFeedState } from "@/modules/agenda/calendar-feed";
import { disableCalendarFeedAction, renewCalendarFeedAction } from "../../actions";

/** Agenda sur le téléphone : lien d'abonnement pour Google Agenda ou le Calendrier de l'iPhone. */
export default async function PhoneCalendarPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/agenda-telephone">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.calendarFeed");
  const state = await page.db((tx) => calendarFeedState(tx, page.tenantId));
  const url =
    state.version > 0
      ? `${publicAppUrl()}/api/calendar/${calendarFeedToken({
          tenantId: page.tenantId,
          businessId: state.businessId,
          version: state.version,
        })}.ics`
      : null;
  const webcal = url?.replace(/^https?:\/\//, "webcal://");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
          {t("title")}
        </h1>
        <p className="mt-1 text-ink/70">{t("intro")}</p>
      </div>
      {!url || !webcal ? (
        <Section title={t("offTitle")}>
          <p className="mb-4 text-ink/80">{t("offText")}</p>
          <ActionForm action={renewCalendarFeedAction} submitLabel={t("enable")} variant="primary">
            <Hidden values={{ tenantId: page.tenantId }} />
          </ActionForm>
        </Section>
      ) : (
        <>
          <Section title={t("iphoneTitle")}>
            <p className="mb-4 text-ink/80">{t("iphoneText")}</p>
            <a href={webcal} className={ui.primaryButton}>
              {t("iphoneButton")}
            </a>
          </Section>
          <Section title={t("googleTitle")}>
            <ol className="mb-4 list-decimal space-y-1 pl-5 text-ink/80">
              <li>{t("googleStep1")}</li>
              <li>{t("googleStep2")}</li>
              <li>{t("googleStep3")}</li>
            </ol>
            <CopyLink value={url} label={t("link")} copyLabel={t("copy")} copiedLabel={t("copied")} />
            <a
              href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`}
              target="_blank"
              rel="noreferrer"
              className={`${ui.secondaryButton} mt-4`}
            >
              {t("googleButton")}
            </a>
            <p className="mt-3 text-sm text-ink/60">{t("googleDelay")}</p>
          </Section>
          <Section title={t("privacyTitle")}>
            <p className="mb-4 text-ink/80">{t("privacyText")}</p>
            <div className="flex flex-wrap gap-x-6">
              <ActionForm
                action={renewCalendarFeedAction}
                submitLabel={t("renew")}
                variant="link"
                className=""
                confirm={t("renewConfirm")}
              >
                <Hidden values={{ tenantId: page.tenantId }} />
              </ActionForm>
              <ActionForm
                action={disableCalendarFeedAction}
                submitLabel={t("disable")}
                variant="danger"
                className=""
                confirm={t("disableConfirm")}
              >
                <Hidden values={{ tenantId: page.tenantId }} />
              </ActionForm>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
