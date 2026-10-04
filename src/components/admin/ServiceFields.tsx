import { getTranslations } from "next-intl/server";
import { centsToInput } from "@/lib/format";
import { CheckboxField, SelectField, TextArea, TextField } from "./fields";

type Service = {
  name: string;
  description: string;
  categoryId: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  priceCents: number;
  priceFrom: boolean;
  isOnlineBookable: boolean;
  isActive: boolean;
};

/** Champs d'une prestation (ajout et modification). */
export async function ServiceFields({
  service,
  categories,
  idPrefix,
}: {
  service?: Service;
  categories: { value: string; label: string }[];
  idPrefix: string;
}) {
  const t = await getTranslations("admin.tenant.services");
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
