import { getTranslations } from "next-intl/server";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { toCsv, toZip } from "@/lib/export/csv";
import { loadManagerTenant, managerQuery } from "@/lib/manager/access";
import { businessDataExport } from "@/modules/export/business-data";

/** Export des données de l'entreprise de la gérante : un .zip de tableaux CSV. */
export async function GET(
  _request: Request,
  context: RouteContext<"/[locale]/espace/[tenantId]/plus/exporter/telecharger">,
) {
  const { locale: rawLocale, tenantId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return new Response(null, { status: 404 });
  const locale = resolveLocale(rawLocale);
  let loaded;
  try {
    loaded = await managerQuery(tenantId, async (tx) => ({
      tenant: await loadManagerTenant(tx, tenantId),
      data: await businessDataExport(tx, tenantId),
    }));
  } catch {
    return new Response(null, { status: 404 });
  }
  const { tenant, data } = loaded;
  if (!tenant) return new Response(null, { status: 404 });
  const [t, tStatus] = await Promise.all([
    getTranslations({ locale, namespace: "manager.export" }),
    getTranslations({ locale, namespace: "manager.status" }),
  ]);
  const timeZone = tenant.timezone;
  const date = (value: Date | null) =>
    value ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeZone }).format(value) : "";
  const time = (value: Date | null) =>
    value ? new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone }).format(value) : "";
  const money = (cents: number) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: false,
    }).format(cents / 100);
  const yesNo = (value: boolean) => (value ? t("yes") : t("no"));
  const text = (value: Parameters<typeof pickLocalized>[0]) => pickLocalized(value, locale);
  const name = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(" ");
  const columns = (key: string) => t.raw(`columns.${key}`) as string[];

  const files: Record<string, string> = {
    customers: toCsv(
      columns("customers"),
      data.customers.map((row) => [
        row.firstName,
        row.lastName,
        row.email,
        row.phone,
        row.birthMonth && row.birthDay
          ? `${String(row.birthDay).padStart(2, "0")}/${String(row.birthMonth).padStart(2, "0")}`
          : "",
        row.visits,
        money(row.spentCents),
        row.notes,
        yesNo(row.emailConsent),
        yesNo(row.smsConsent),
        date(row.createdAt),
        row.anonymizedAt ? t("anonymized") : "",
      ]),
    ),
    appointments: toCsv(
      columns("appointments"),
      data.appointments.map((row) => [
        date(row.startsAt),
        time(row.startsAt),
        time(row.endsAt),
        name(row.customerFirstName, row.customerLastName),
        row.services.map(text).join(", "),
        row.staffName,
        tStatus(row.status),
        t(`source.${row.source}`),
        money(row.totalCents),
        money(row.discountCents),
        money(row.depositCents),
        row.currency,
        row.customerNote,
        row.internalNote,
      ]),
    ),
    services: toCsv(
      columns("services"),
      data.services.map((row) => [
        text(row.name),
        row.category ? text(row.category) : "",
        row.durationMinutes,
        money(row.priceCents),
        yesNo(row.priceFrom),
        row.currency,
        yesNo(row.isActive),
        yesNo(row.isOnlineBookable),
      ]),
    ),
    payments: toCsv(
      columns("payments"),
      data.payments.map((row) => [
        date(row.createdAt),
        money(row.amountCents),
        row.currency,
        t(`payment.${row.status}`),
        name(row.customerFirstName, row.customerLastName),
        date(row.appointmentStartsAt),
      ]),
    ),
    giftCards: toCsv(
      columns("giftCards"),
      data.giftCards.map((row) => [
        row.codeLast4,
        t(`giftCard.${row.status}`),
        money(row.initialCents),
        money(row.balanceCents),
        row.currency,
        row.purchaserName,
        row.purchaserEmail,
        row.recipientName,
        date(row.paidAt),
        date(row.expiresAt),
      ]),
    ),
    promoCodes: toCsv(
      columns("promoCodes"),
      data.promoCodes.map((row) => [
        row.code,
        t(`discount.${row.discountType}`),
        row.discountType === "percent" ? `${row.discountValue} %` : money(row.discountValue),
        date(row.validFrom),
        date(row.validUntil),
        row.maxUses,
        row.usedCount,
        yesNo(row.isActive),
      ]),
    ),
  };
  const zip = toZip(
    Object.fromEntries(
      Object.entries(files).map(([key, csv]) => [`${t(`files.${key}` as "files.customers")}.csv`, csv]),
    ),
  );
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date());
  const fileName = `${t("fileName", { date: today })}.zip`;
  return new Response(new Blob([zip as Uint8Array<ArrayBuffer>]), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
