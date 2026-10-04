import { getTranslations } from "next-intl/server";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { searchCustomers } from "@/modules/customers/customers";
import { formatPhone } from "@/modules/phone";

/** Liste des clientes avec recherche. */
export default async function CustomersPage({
  params,
  searchParams,
}: PageProps<"/[locale]/espace/[tenantId]/clientes">) {
  const page = await managerPage(params);
  const q = typeof (await searchParams).q === "string" ? ((await searchParams).q as string) : "";
  const t = await getTranslations("manager.customers");
  const tCommon = await getTranslations("common");
  const list = await page.db((tx) => searchCustomers(tx, page.tenantId, q, 100));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <Link href={`${page.base}/clientes/nouvelle`} className={`${ui.secondaryButton} w-auto`}>
          + {t("new")}
        </Link>
      </div>
      <form method="get" role="search" className="flex gap-2">
        <label htmlFor="q" className="sr-only">
          {t("search")}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t("search")}
          className={ui.input}
        />
        <button type="submit" className={`${ui.primaryButton} w-auto`}>
          {tCommon("search")}
        </button>
      </form>
      {list.length === 0 ? (
        <p className={ui.card}>{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-navy/10 rounded-[var(--radius-card)] bg-white shadow-sm">
          {list.map((customer) => (
            <li key={customer.id}>
              <Link
                href={`${page.base}/clientes/${customer.id}`}
                className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-ivory"
              >
                <span>
                  <span className="block font-semibold">
                    {[customer.firstName, customer.lastName].filter(Boolean).join(" ")}
                  </span>
                  <span className="block text-sm text-ink/60">
                    {customer.phone ? formatPhone(customer.phone) : customer.email}
                  </span>
                </span>
                <span className="text-right text-xs text-ink/60">
                  {customer.lastVisit
                    ? t("lastVisit", { date: page.fmt.short(new Date(customer.lastVisit)) })
                    : t("never")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
