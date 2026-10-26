import { getTranslations } from "next-intl/server";
import { ui } from "@/components/ui/styles";

/** Entreprise secondaire d'un site : photos et avis se gèrent depuis l'entreprise principale. */
export async function SharedContentNotice() {
  const t = await getTranslations("manager.site");
  return <p className={ui.card}>{t("sharedContent")}</p>;
}
