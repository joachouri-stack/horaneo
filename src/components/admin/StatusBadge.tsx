import { useTranslations } from "next-intl";

const COLORS: Record<string, string> = {
  draft: "bg-navy/10 text-navy",
  active: "bg-success/15 text-[#1e6b48]",
  suspended: "bg-coral/15 text-coral-dark",
  cancelled: "bg-ink/10 text-ink",
  deleted: "bg-ink/10 text-ink/60",
};

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("status");
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${COLORS[status] ?? ""}`}>
      {t(status as "draft")}
    </span>
  );
}
