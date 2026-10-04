import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { ManualAppointmentForm } from "@/components/manager/ManualAppointmentForm";
import { ui } from "@/components/ui/styles";
import { customers } from "@/db/schema";
import { pickLocalized } from "@/i18n/locales";
import { managerPage } from "@/lib/manager/page";
import { loadBookingContext } from "@/modules/booking/availability";
import { DATE_PATTERN, utcToLocal } from "@/modules/booking/time";

/** Nouveau rendez-vous ajouté à la main. Paramètres facultatifs : date, heure, membre, cliente. */
export default async function NewAppointmentPage({
  params,
  searchParams,
}: PageProps<"/[locale]/espace/[tenantId]/rendez-vous/nouveau">) {
  const page = await managerPage(params);
  const query = await searchParams;
  const t = await getTranslations("manager.manual");
  const value = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined);
  const customerId = value("cliente");
  const { context, customer } = await page.db(async (tx) => ({
    context: await loadBookingContext(tx, page.tenantId),
    customer:
      customerId && /^[0-9a-f-]{36}$/i.test(customerId)
        ? (await tx.select().from(customers).where(eq(customers.id, customerId)))[0]
        : undefined,
  }));
  const now = utcToLocal(new Date(), page.tenant.timezone);
  const date = value("date") && DATE_PATTERN.test(value("date")!) ? value("date")! : now.date;
  const time = value("heure") && /^\d{2}:\d{2}$/.test(value("heure")!) ? value("heure")! : "09:00";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      <div className={ui.card}>
        <ManualAppointmentForm
          tenantId={page.tenantId}
          services={context.services.map((service) => ({
            id: service.id,
            name: pickLocalized(service.name, page.locale),
            durationMinutes: service.durationMinutes,
          }))}
          staff={context.staff.map((member) => ({
            id: member.id,
            name: member.name,
            serviceIds: member.serviceIds,
          }))}
          defaults={{
            date,
            time,
            staffId: value("membre") ?? null,
            customer: customer
              ? { id: customer.id, name: [customer.firstName, customer.lastName].filter(Boolean).join(" ") }
              : null,
          }}
        />
      </div>
    </div>
  );
}
