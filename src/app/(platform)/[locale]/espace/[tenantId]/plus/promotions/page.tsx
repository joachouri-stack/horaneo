import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, SelectField, TextField } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { pickLocalized } from "@/i18n/locales";
import { centsToInput } from "@/lib/format";
import { managerPage } from "@/lib/manager/page";
import { firstPlanWith } from "@/modules/billing/plans";
import { localToUtc, utcToLocal } from "@/modules/booking/time";
import { listServices } from "@/modules/catalog/services";
import { listPromotions } from "@/modules/promotions/promotions";
import { deletePromotionAction, savePromotionAction } from "../../actions";

type PromotionRow = Awaited<ReturnType<typeof listPromotions>>[number];

/** Promotions datées : bandeau « offre du moment » et prix barré pendant la période. */
export default async function PromotionsPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/promotions">) {
  const page = await managerPage(params);
  const [t, tCommon] = await Promise.all([getTranslations("manager.promotions"), getTranslations("common")]);
  const available = Boolean(page.tenant.features.promotions);
  const { promotions, services } = available
    ? await page.db(async (tx) => ({
        promotions: await listPromotions(tx, page.tenantId),
        services: (await listServices(tx, page.tenantId)).filter((service) => service.isActive),
      }))
    : { promotions: [], services: [] };
  const locale = page.tenant.defaultLocale as "fr";
  const today = utcToLocal(new Date(), page.tenant.timezone).date;
  const dateLabel = (date: string) => page.fmt.short(localToUtc(date, "12:00", page.tenant.timezone));

  const fields = (promotion: PromotionRow | null) => {
    const key = promotion?.id ?? "new";
    return (
      <>
        <Hidden values={{ tenantId: page.tenantId, id: promotion?.id }} />
        <TextField
          id={`title-${key}`}
          name="title"
          label={t("titleLabel")}
          hint={t("titleHint")}
          defaultValue={promotion ? pickLocalized(promotion.title, locale) : undefined}
          required
        />
        <fieldset>
          <legend className="mb-2 font-semibold">{t("services")}</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {services.map((service) => (
              <CheckboxField
                key={service.id}
                name="serviceIds"
                value={service.id}
                label={`${pickLocalized(service.name, locale)} · ${page.fmt.money(service.priceCents)}`}
                defaultChecked={promotion?.serviceIds.includes(service.id)}
              />
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            id={`type-${key}`}
            name="discountType"
            label={t("discountType")}
            defaultValue={promotion?.discountType ?? "percent"}
            options={[
              { value: "percent", label: t("percent") },
              { value: "fixed", label: t("fixed") },
            ]}
          />
          <TextField
            id={`value-${key}`}
            name="discountValue"
            inputMode="decimal"
            label={t("discountValue")}
            defaultValue={
              promotion
                ? promotion.discountType === "percent"
                  ? String(promotion.discountValue)
                  : centsToInput(promotion.discountValue)
                : undefined
            }
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            id={`from-${key}`}
            name="startsOn"
            type="date"
            label={t("startsOn")}
            defaultValue={promotion?.startsOn ?? today}
            required
          />
          <TextField
            id={`until-${key}`}
            name="endsOn"
            type="date"
            label={t("endsOn")}
            defaultValue={promotion?.endsOn}
            required
          />
        </div>
      </>
    );
  };

  const stateOf = (promotion: PromotionRow) =>
    promotion.endsOn < today ? "ended" : promotion.startsOn > today ? "upcoming" : "current";

  return (
    <div className="space-y-6">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
        {t("title")}
      </h1>
      {!available ? (
        <p className={ui.card}>
          {t("unavailable", {
            plan: (await page.db((tx) => firstPlanWith(tx, "promotions", page.locale))) ?? "none",
          })}
        </p>
      ) : (
        <>
          <p className="text-ink/80">{t("intro")}</p>
          <p className="text-sm text-ink/70">{t("referenceRule")}</p>
          {promotions.length === 0 ? (
            <p className="text-ink/70">{t("empty")}</p>
          ) : (
            <ul className="space-y-3">
              {promotions.map((promotion) => {
                const state = stateOf(promotion);
                return (
                  <li key={promotion.id}>
                    <details className={ui.card}>
                      <summary className="cursor-pointer">
                        <span
                          className={`block text-lg font-semibold ${state === "ended" ? "text-ink/50" : "text-night"}`}
                        >
                          {pickLocalized(promotion.title, locale)}{" "}
                          <span className="text-sm font-semibold text-ink/70">· {t(`state.${state}`)}</span>
                        </span>
                        <span className="block text-sm text-ink/70">
                          {t("summary", {
                            value:
                              promotion.discountType === "percent"
                                ? `− ${promotion.discountValue} %`
                                : `− ${page.fmt.money(promotion.discountValue)}`,
                            from: dateLabel(promotion.startsOn),
                            until: dateLabel(promotion.endsOn),
                            count: promotion.serviceIds.length,
                          })}
                        </span>
                      </summary>
                      <ActionForm
                        action={savePromotionAction}
                        submitLabel={tCommon("save")}
                        className="mt-4 space-y-4"
                      >
                        {fields(promotion)}
                      </ActionForm>
                      <ActionForm
                        action={deletePromotionAction}
                        submitLabel={t("delete")}
                        variant="link"
                        confirm={t("deleteConfirm")}
                        className="mt-2"
                      >
                        <Hidden values={{ tenantId: page.tenantId, id: promotion.id }} />
                      </ActionForm>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
          <details className={ui.card} open={promotions.length === 0}>
            <summary className="cursor-pointer text-lg font-semibold text-night">+ {t("new")}</summary>
            <ActionForm
              action={savePromotionAction}
              submitLabel={tCommon("save")}
              resetOnSuccess
              className="mt-4 space-y-4"
            >
              {fields(null)}
            </ActionForm>
          </details>
        </>
      )}
    </div>
  );
}
