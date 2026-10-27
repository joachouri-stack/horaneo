import { getLocale, getTranslations } from "next-intl/server";
import { SelectField, TextArea, TextField } from "@/components/admin/fields";
import { birthMonthNames } from "@/modules/customers/birthday";

type Customer = {
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  birthMonth: number | null;
  birthDay: number | null;
};

/** Champs d'une fiche cliente (création et modification). */
export async function CustomerFields({ customer }: { customer?: Customer }) {
  const t = await getTranslations("manager.manual");
  const tCustomers = await getTranslations("manager.customers");
  const locale = await getLocale();
  // Jour et mois (jamais l'année) : une option vide pour « non renseigné ».
  const empty = { value: "", label: tCustomers("birthdayEmpty") };
  const days = [
    empty,
    ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
  ];
  const months = [
    empty,
    ...birthMonthNames(locale).map((item) => ({ value: String(item.month), label: item.name })),
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField name="firstName" label={t("firstName")} defaultValue={customer?.firstName} required />
      <TextField name="lastName" label={t("lastName")} defaultValue={customer?.lastName} />
      <TextField name="phone" type="tel" inputMode="tel" label={t("phone")} defaultValue={customer?.phone} />
      <TextField
        name="email"
        type="email"
        inputMode="email"
        label={t("email")}
        defaultValue={customer?.email}
      />
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 block font-semibold text-night">{tCustomers("birthday")}</legend>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
          <SelectField
            name="birthDay"
            label={tCustomers("birthdayDay")}
            options={days}
            defaultValue={customer?.birthDay ? String(customer.birthDay) : ""}
          />
          <SelectField
            name="birthMonth"
            label={tCustomers("birthdayMonth")}
            options={months}
            defaultValue={customer?.birthMonth ? String(customer.birthMonth) : ""}
          />
        </div>
        <p className="mt-1 text-sm text-ink/60">{tCustomers("birthdayHint")}</p>
      </fieldset>
      <div className="sm:col-span-2">
        <TextArea
          name="notes"
          label={tCustomers("notes")}
          hint={tCustomers("notesHint")}
          defaultValue={customer?.notes}
          rows={3}
        />
      </div>
    </div>
  );
}
