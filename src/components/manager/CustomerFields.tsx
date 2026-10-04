import { getTranslations } from "next-intl/server";
import { TextArea, TextField } from "@/components/admin/fields";

type Customer = {
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

/** Champs d'une fiche cliente (création et modification). */
export async function CustomerFields({ customer }: { customer?: Customer }) {
  const t = await getTranslations("manager.manual");
  const tCustomers = await getTranslations("manager.customers");
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
