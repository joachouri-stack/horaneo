import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

type Props = {
  businesses: { id: string; name: string }[];
  currentId: string;
  /** Adresse de la page, sans paramètre. */
  href: string;
};

/** Choix de l'entreprise modifiée, sur un site qui en regroupe plusieurs. */
export async function BusinessPicker({ businesses, currentId, href }: Props) {
  if (businesses.length < 2) return null;
  const t = await getTranslations("admin.tenant.businessPicker");
  return (
    <nav aria-label={t("label")} className="space-y-2">
      <p className="text-sm text-ink/70">{t("hint")}</p>
      <ul className="flex flex-wrap gap-2">
        {businesses.map((business) => (
          <li key={business.id}>
            <Link
              href={`${href}?entreprise=${business.id}`}
              aria-current={business.id === currentId ? "page" : undefined}
              className="inline-block rounded-full border border-navy/20 px-4 py-2 text-sm font-semibold text-navy hover:bg-navy/5 aria-[current=page]:border-navy aria-[current=page]:bg-navy aria-[current=page]:text-white"
            >
              {business.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
