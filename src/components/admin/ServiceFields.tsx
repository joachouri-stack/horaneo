import { getTranslations } from "next-intl/server";
import { centsToInput } from "@/lib/format";
import { CheckboxField, SelectField, TextArea, TextField, ToggleField } from "./fields";

type Service = {
  name: string;
  description: string;
  categoryId: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  priceCents: number;
  costCents: number | null;
  priceFrom: boolean;
  isOnlineBookable: boolean;
  isActive: boolean;
};

/**
 * Champs d'une prestation (ajout et modification). `simple` (espace gérante) : l'essentiel
 * d'abord (nom, prix, durée, catégorie, deux interrupteurs), le reste replié sous « Plus d'options ».
 */
export async function ServiceFields({
  service,
  categories,
  idPrefix,
  simple = false,
}: {
  service?: Service;
  categories: { value: string; label: string }[];
  idPrefix: string;
  simple?: boolean;
}) {
  const t = await getTranslations("admin.tenant.services");
  if (simple) {
    return (
      <div className="space-y-4">
        <TextField
          id={`${idPrefix}-name`}
          name="name"
          label={t("name")}
          defaultValue={service?.name}
          required
        />
        <div className="grid grid-cols-2 items-end gap-4">
          <TextField
            id={`${idPrefix}-price`}
            name="price"
            inputMode="decimal"
            label={t("price")}
            defaultValue={service ? centsToInput(service.priceCents) : ""}
            required
          />
          <TextField
            id={`${idPrefix}-duration`}
            name="durationMinutes"
            type="number"
            inputMode="numeric"
            label={t("duration")}
            defaultValue={service?.durationMinutes ?? 30}
            required
          />
        </div>
        {categories.length > 0 && (
          <SelectField
            id={`${idPrefix}-category`}
            name="categoryId"
            label={t("category")}
            defaultValue={service?.categoryId ?? ""}
            options={[{ value: "", label: t("noCategory") }, ...categories]}
          />
        )}
        <div className="divide-y divide-navy/10 rounded-xl border border-navy/10 px-4">
          <ToggleField
            name="isActive"
            label={t("active")}
            hint={t("activeHint")}
            defaultChecked={service?.isActive ?? true}
          />
          <ToggleField
            name="isOnlineBookable"
            label={t("onlineBookable")}
            hint={t("onlineBookableHint")}
            defaultChecked={service?.isOnlineBookable ?? true}
          />
        </div>
        <details className="group/opts rounded-xl bg-mist-50 px-4">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between font-medium text-night [&::-webkit-details-marker]:hidden">
            {t("moreOptions")}
            <span aria-hidden="true" className="text-ink/50 transition group-open/opts:rotate-180">
              ▾
            </span>
          </summary>
          <div className="space-y-4 pb-4">
            <TextArea
              id={`${idPrefix}-description`}
              name="description"
              label={t("description")}
              defaultValue={service?.description}
              rows={2}
            />
            <ToggleField
              name="priceFrom"
              label={t("priceFrom")}
              defaultChecked={service?.priceFrom ?? false}
            />
            <TextField
              id={`${idPrefix}-buffer`}
              name="bufferMinutes"
              type="number"
              inputMode="numeric"
              label={t("buffer")}
              hint={t("bufferHint")}
              defaultValue={service?.bufferMinutes ?? 0}
            />
            <TextField
              id={`${idPrefix}-cost`}
              name="cost"
              inputMode="decimal"
              label={t("cost")}
              hint={t("costHint")}
              defaultValue={service?.costCents == null ? "" : centsToInput(service.costCents)}
            />
          </div>
        </details>
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        id={`${idPrefix}-name`}
        name="name"
        label={t("name")}
        defaultValue={service?.name}
        required
      />
      <SelectField
        id={`${idPrefix}-category`}
        name="categoryId"
        label={t("category")}
        defaultValue={service?.categoryId ?? ""}
        options={[{ value: "", label: t("noCategory") }, ...categories]}
      />
      <TextField
        id={`${idPrefix}-duration`}
        name="durationMinutes"
        type="number"
        inputMode="numeric"
        label={t("duration")}
        defaultValue={service?.durationMinutes ?? 30}
        required
      />
      <TextField
        id={`${idPrefix}-price`}
        name="price"
        inputMode="decimal"
        label={t("price")}
        defaultValue={service ? centsToInput(service.priceCents) : ""}
        required
      />
      <TextField
        id={`${idPrefix}-buffer`}
        name="bufferMinutes"
        type="number"
        inputMode="numeric"
        label={t("buffer")}
        hint={t("bufferHint")}
        defaultValue={service?.bufferMinutes ?? 0}
      />
      <TextField
        id={`${idPrefix}-cost`}
        name="cost"
        inputMode="decimal"
        label={t("cost")}
        hint={t("costHint")}
        defaultValue={service?.costCents == null ? "" : centsToInput(service.costCents)}
      />
      <div className="sm:col-span-2">
        <TextArea
          id={`${idPrefix}-description`}
          name="description"
          label={t("description")}
          defaultValue={service?.description}
          rows={2}
        />
      </div>
      <div className="flex flex-wrap gap-x-6 sm:col-span-2">
        <CheckboxField name="priceFrom" label={t("priceFrom")} defaultChecked={service?.priceFrom ?? false} />
        <CheckboxField
          name="isOnlineBookable"
          label={t("onlineBookable")}
          defaultChecked={service?.isOnlineBookable ?? true}
        />
        <CheckboxField name="isActive" label={t("active")} defaultChecked={service?.isActive ?? true} />
      </div>
    </div>
  );
}
