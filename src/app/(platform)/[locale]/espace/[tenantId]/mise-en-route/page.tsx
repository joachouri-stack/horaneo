import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, TextArea, TextField } from "@/components/admin/fields";
import { SetupSteps } from "@/components/manager/SetupSteps";
import { ui } from "@/components/ui/styles";
import { authSecret } from "@/config/env";
import { tenantDomains } from "@/db/schema";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { createPreviewToken, PREVIEW_PARAM } from "@/lib/tenancy/preview";
import { tenantSiteUrl } from "@/lib/tenancy/urls";
import { siteSetupView } from "@/modules/setup/site-setup";
import { approveSiteAction, submitSetupAction } from "../actions";

/**
 * Mise en route du site créé pour le client : où il en est, le questionnaire (ses infos pour
 * créer le site), puis la validation de son site avant la mise en ligne.
 */
export default async function SetupPage({ params }: PageProps<"/[locale]/espace/[tenantId]/mise-en-route">) {
  const page = await managerPage(params, "owner");
  const t = await getTranslations("manager.setup");
  const { view, subdomain } = await page.db(async (tx) => ({
    view: await siteSetupView(tx, page.tenantId, {
      customDomain: Boolean(page.tenant.features.customDomain),
      status: page.tenant.status,
    }),
    subdomain: (
      await tx
        .select({ hostname: tenantDomains.hostname })
        .from(tenantDomains)
        .where(and(eq(tenantDomains.tenantId, page.tenantId), eq(tenantDomains.type, "subdomain")))
    )[0],
  }));

  if (!view) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
          {t("title")}
        </h1>
        <p className="text-ink/80">{t("none")}</p>
        <Link href={page.base} className={`${ui.secondaryButton} sm:w-auto`}>
          {t("backHome")}
        </Link>
      </div>
    );
  }
  const { setup, steps, complete } = view;
  const answers = setup.answers;
  const awaitingApproval = Boolean(setup.reviewRequestedAt) && !setup.approvedAt;
  // Site pas encore en ligne : aperçu par l'adresse provisoire, avec un jeton d'aperçu.
  const previewUrl = subdomain
    ? page.tenant.status === "draft"
      ? `${tenantSiteUrl(subdomain.hostname)}/?${PREVIEW_PARAM}=${createPreviewToken(page.tenantId, authSecret())}`
      : tenantSiteUrl(subdomain.hostname)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
          {t("title")}
        </h1>
        <p className="mt-1 text-ink/70">{complete ? t("introDone") : t("intro")}</p>
      </div>

      <section className={ui.card} aria-labelledby="etapes">
        <h2 id="etapes" className="mb-4 text-lg font-semibold text-night">
          {t("stepsTitle")}
        </h2>
        <SetupSteps steps={steps} />
      </section>

      {/* Site prêt : le client le regarde, puis le valide (ou demande des changements). */}
      {awaitingApproval && (
        <section className={`${ui.card} space-y-4`} aria-labelledby="valider">
          <h2 id="valider" className="text-lg font-semibold text-night">
            {t("review.title")}
          </h2>
          <p className="text-ink/80">{t("review.text")}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener"
                className={`${ui.secondaryButton} sm:w-auto`}
              >
                {t("review.preview")}
              </a>
            )}
            <ActionForm
              action={approveSiteAction}
              submitLabel={t("review.approve")}
              confirm={t("review.confirm")}
            >
              <Hidden values={{ tenantId: page.tenantId }} />
            </ActionForm>
          </div>
          <p className="text-sm text-ink/70">
            {t.rich("review.changes", {
              link: (chunks) => (
                <Link href={`${page.base}/plus/demandes`} className="font-medium text-accent underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </section>
      )}

      {/* Questionnaire : rempli après l'achat, modifiable jusqu'à la validation du site. */}
      {!setup.approvedAt && (
        <section className={ui.card} aria-labelledby="questionnaire">
          <h2 id="questionnaire" className="text-lg font-semibold text-night">
            {t("form.title")}
          </h2>
          <p className="mb-5 mt-1 text-ink/70">{setup.submittedAt ? t("form.sent") : t("form.intro")}</p>
          <ActionForm
            action={submitSetupAction}
            submitLabel={setup.submittedAt ? t("form.update") : t("form.submit")}
            className="space-y-5"
          >
            <Hidden values={{ tenantId: page.tenantId }} />
            <TextArea
              name="activity"
              label={t("form.activity")}
              hint={t("form.activityHint")}
              rows={3}
              required
              defaultValue={answers.activity}
            />
            <TextArea
              name="services"
              label={t("form.services")}
              hint={t("form.servicesHint")}
              rows={4}
              defaultValue={answers.services}
            />
            <TextArea name="hours" label={t("form.hours")} rows={3} defaultValue={answers.hours} />
            <TextArea
              name="style"
              label={t("form.style")}
              hint={t("form.styleHint")}
              rows={3}
              defaultValue={answers.style}
            />
            {page.tenant.features.customDomain && (
              <TextField
                name="domain"
                label={t("form.domain")}
                hint={t("form.domainHint")}
                defaultValue={answers.domain}
              />
            )}
            <TextArea
              name="links"
              label={t("form.links")}
              hint={t("form.linksHint")}
              rows={2}
              defaultValue={answers.links}
            />
            <TextArea name="notes" label={t("form.notes")} rows={3} defaultValue={answers.notes} />
            <p className="text-sm text-ink/70">
              {t.rich("form.photos", {
                link: (chunks) => (
                  <Link href={`${page.base}/site`} className="font-medium text-accent underline">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
