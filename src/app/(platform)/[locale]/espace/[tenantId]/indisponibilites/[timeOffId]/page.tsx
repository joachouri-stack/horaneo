import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden } from "@/components/admin/fields";
import { TimeOffForm } from "@/components/manager/TimeOffForm";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { loadBookingContext } from "@/modules/booking/availability";
import { utcToLocal } from "@/modules/booking/time";
import { getTimeOff } from "@/modules/schedule/time-off";
import { agendaStaffFilter } from "@/modules/team/access";
import { deleteTimeOffAction } from "../../actions";

/** Modifier ou supprimer une indisponibilité (congé, créneau bloqué, fermeture), ouverte depuis l'agenda. */
export default async function EditUnavailabilityPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/indisponibilites/[timeOffId]">) {
  const page = await managerPage(params, "agenda");
  const { timeOffId } = await params;
  const t = await getTranslations("manager.unavailability");
  const tAgenda = await getTranslations("manager.agenda");
  const ownStaff = agendaStaffFilter(page.space);
  const { item, staff } = await page.db(async (tx) => ({
    item: /^[0-9a-f-]{36}$/i.test(timeOffId) ? await getTimeOff(tx, page.tenantId, timeOffId) : null,
    staff: (await loadBookingContext(tx, page.tenantId)).staff,
  }));
  // Collaborateur limité à son agenda : seulement ses propres absences.
  if (!item || (ownStaff && item.staffId !== ownStaff)) notFound();
  const tz = page.tenant.timezone;
  const start = utcToLocal(item.startsAt, tz);
  const end = utcToLocal(item.endsAt, tz);
  // Jours entiers : la fin enregistrée est minuit le lendemain du dernier jour.
  const lastDay = utcToLocal(new Date(item.endsAt.getTime() - 1), tz).date;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`${page.base}/agenda?date=${start.date}`}
          className="text-sm font-medium text-accent underline"
        >
          ← {tAgenda("title")}
        </Link>
        <h1 className="mt-2 font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
          {t("editTitle", { kind: tAgenda(`timeOff.${item.kind}`) })}
        </h1>
      </div>
      <section className={ui.card}>
        <TimeOffForm
          tenantId={page.tenantId}
          kind={item.kind}
          staff={ownStaff ? staff.filter((member) => member.id === ownStaff) : staff}
          today={start.date}
          timeZone={tz}
          initial={{
            id: item.id,
            staffId: item.staffId,
            date: start.date,
            from: start.time,
            to: end.time,
            startDate: start.date,
            endDate: lastDay,
            reason: item.reason ?? "",
          }}
        />
      </section>
      <section className={ui.card}>
        <ActionForm
          action={deleteTimeOffAction}
          submitLabel={t("remove")}
          confirm={t("removeConfirm")}
          successMessage={t("removed")}
          variant="dangerOutline"
        >
          <Hidden values={{ tenantId: page.tenantId, id: item.id }} />
        </ActionForm>
      </section>
    </div>
  );
}
