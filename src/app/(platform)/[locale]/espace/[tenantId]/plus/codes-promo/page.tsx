import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, SelectField, TextField } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { withTenant } from "@/db/access";
import { centsToInput } from "@/lib/format";
import { managerPage } from "@/lib/manager/page";
import { localToUtc } from "@/modules/booking/time";
import { listPromoCodes } from "@/modules/promo/codes";
import { deletePromoCodeAction, savePromoCodeAction } from "../../actions";

type PromoRow = Awaited<ReturnType<typeof listPromoCodes>>[number];

/** Codes promo : création, modification, désactivation. */
export default async function PromoCodesPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/codes-promo">) {
  const page = await managerPage(params);
  const [t, tCommon] = await Promise.all([getTranslations("manager.promo"), getTranslations("common")]);
  const available = Boolean(page.tenant.features.promoCodes);
  const codes = available ? await withTenant(page.tenantId, (tx) => listPromoCodes(tx, page.tenantId)) : [];
  const dateLabel = (date: string) => page.fmt.short(localToUtc(date, "12:00", page.tenant.timezone));

  const fields = (code: PromoRow | null) => {
    const key = code?.id ?? "new";
    return (
      <>
        <Hidden values={{ tenantId: page.tenantId, id: code?.id }} />
        <TextField
          id={`code-${key}`}
          name="code"
          label={t("code")}
          hint={t("codeHint")}
          defaultValue={code?.code}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            id={`type-${key}`}
            name="discountType"
            label={t("discountType")}
            defaultValue={code?.discountType ?? "percent"}
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
              code
                ? code.discountType === "percent"
                  ? String(code.discountValue)
                  : centsToInput(code.discountValue)
                : undefined
            }
            required
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            id={`from-${key}`}
            name="validFrom"
            type="date"
            label={t("validFrom")}
            defaultValue={code?.validFromDate}
          />
          <TextField
            id={`until-${key}`}
            name="validUntil"
            type="date"
            label={t("validUntil")}
            defaultValue={code?.validUntilDate}
          />
        </div>
        <TextField
          id={`max-${key}`}
          name="maxUses"
          type="number"
          inputMode="numeric"
          label={t("maxUses")}
          defaultValue={code?.maxUses ?? undefined}
        />
        <CheckboxField name="isActive" label={t("isActive")} defaultChecked={code?.isActive ?? true} />
      </>
    );
  };

  const summary = (code: PromoRow) => {
    const value =
      code.discountType === "percent"
        ? `− ${code.discountValue} %`
        : `− ${page.fmt.money(code.discountValue)}`;
    const period =
      code.validFromDate && code.validUntilDate
        ? t("period", { from: dateLabel(code.validFromDate), until: dateLabel(code.validUntilDate) })
        : code.validFromDate
          ? t("from", { from: dateLabel(code.validFromDate) })
          : code.validUntilDate
            ? t("until", { until: dateLabel(code.validUntilDate) })
            : null;
    const uses =
      code.maxUses !== null
        ? t("usesOf", { count: code.usedCount, max: code.maxUses })
        : t("uses", { count: code.usedCount });
    return [value, period, uses, code.isActive ? null : t("inactive")].filter(Boolean).join(" · ");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      {!available ? (
        <p className={ui.card}>{t("unavailable")}</p>
      ) : (
        <>
          <p className="text-ink/80">{t("intro")}</p>
          {codes.length === 0 ? (
            <p className="text-ink/70">{t("empty")}</p>
          ) : (
            <ul className="space-y-3">
              {codes.map((code) => (
                <li key={code.id}>
                  <details className={ui.card}>
                    <summary className="cursor-pointer">
                      <span
                        className={`block text-lg font-bold ${code.isActive ? "text-navy" : "text-ink/50"}`}
                      >
                        {code.code}
                      </span>
                      <span className="block text-sm text-ink/70">{summary(code)}</span>
                    </summary>
                    <ActionForm
                      action={savePromoCodeAction}
                      submitLabel={tCommon("save")}
                      className="mt-4 space-y-4"
                    >
                      {fields(code)}
                    </ActionForm>
                    <ActionForm
                      action={deletePromoCodeAction}
                      submitLabel={t("delete")}
                      variant="link"
                      confirm={t("deleteConfirm")}
                      className="mt-2"
                    >
                      <Hidden values={{ tenantId: page.tenantId, id: code.id }} />
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ul>
          )}
          <details className={ui.card} open={codes.length === 0}>
            <summary className="cursor-pointer text-lg font-bold text-navy">+ {t("new")}</summary>
            <ActionForm
              action={savePromoCodeAction}
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
