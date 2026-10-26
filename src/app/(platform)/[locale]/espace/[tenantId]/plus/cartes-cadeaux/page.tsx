import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, Section, TextField } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { centsToInput } from "@/lib/format";
import { managerPage } from "@/lib/manager/page";
import { paymentGateway } from "@/lib/payments/stripe";
import { firstPlanWith } from "@/modules/billing/plans";
import { getBookingSettings } from "@/modules/booking/settings";
import { listGiftCards, type GiftCardState } from "@/modules/giftcards/giftcards";
import { paymentSetup } from "@/modules/payments/connect";
import { redeemGiftCardAction, saveGiftCardSettingsAction } from "../../actions";

const FILTERS = ["all", "active", "used", "expired"] as const;

/** Cartes cadeaux : encaisser une carte sur place, liste des cartes, réglages. */
export default async function GiftCardsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/espace/[tenantId]/plus/cartes-cadeaux">) {
  const page = await managerPage(params);
  const query = await searchParams;
  const [t, tCommon] = await Promise.all([getTranslations("manager.giftCards"), getTranslations("common")]);
  const available = Boolean(page.tenant.features.giftCards);
  const filter = FILTERS.find((item) => item === query.filtre) ?? "all";
  // Cartes déjà vendues : toujours visibles et encaissables, même si le pack
  // ne permet plus d'en vendre (seuls la vente et les réglages disparaissent).
  const data = await page.db(async (tx) => ({
    cards: await listGiftCards(tx, page.tenantId),
    settings: await getBookingSettings(tx, page.tenantId),
  }));

  if (!available && data.cards.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
          {t("title")}
        </h1>
        <p className={ui.card}>
          {t("unavailable", {
            plan: (await page.db((tx) => firstPlanWith(tx, "giftCards", page.locale))) ?? "none",
          })}
        </p>
      </div>
    );
  }
  const payment = paymentSetup(page.business, page.tenant.features, paymentGateway() !== null);
  const visible = data.cards.filter((card) => filter === "all" || card.state === (filter as GiftCardState));
  const settings = data.settings;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
        {t("title")}
      </h1>
      <p className="text-ink/80">{t("intro")}</p>
      {!available && <p className={ui.card}>{t("soldBefore")}</p>}
      {available && payment === "platform_off" && <p className={ui.card}>{t("platformOff")}</p>}
      {available && payment !== "active" && payment !== "platform_off" && (
        <p className={ui.card}>
          {t("needsStripe")}{" "}
          <Link href={`${page.base}/plus/paiements`} className="font-semibold underline">
            →
          </Link>
        </p>
      )}

      <Section title={t("redeemTitle")}>
        <ActionForm
          action={redeemGiftCardAction}
          submitLabel={t("redeem")}
          confirm={t("redeemConfirm")}
          resetOnSuccess
          className="space-y-4"
        >
          <Hidden values={{ tenantId: page.tenantId }} />
          <TextField name="code" label={t("code")} required />
          <TextField name="amount" inputMode="decimal" label={t("amount")} required />
          <TextField name="note" label={t("note")} />
        </ActionForm>
      </Section>

      <Section title={t("listTitle")}>
        <nav className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <Link
              key={item}
              href={`${page.base}/plus/cartes-cadeaux${item === "all" ? "" : `?filtre=${item}`}`}
              aria-current={filter === item ? "page" : undefined}
              className="rounded-full border border-navy/20 px-4 py-2 text-sm font-semibold text-night aria-[current=page]:bg-navy aria-[current=page]:text-white"
            >
              {t(`filter.${item}`)}
            </Link>
          ))}
        </nav>
        {visible.length === 0 ? (
          <p className="text-ink/70">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-navy/10">
            {visible.map((card) => (
              <li key={card.id} className="py-3">
                <p className="font-semibold">
                  •••• {card.codeLast4}{" "}
                  <span className={card.state === "active" ? "text-success" : "text-ink/60"}>
                    · {t(`state.${card.state}`)}
                  </span>
                </p>
                <p className="text-sm text-ink/70">
                  {t("line", {
                    amount: page.fmt.money(card.initialCents),
                    balance: page.fmt.money(card.balanceCents),
                    date: page.fmt.short(card.expiresAt),
                  })}
                </p>
                <p className="text-sm text-ink/70">
                  {t("from", { name: card.purchaserName })}
                  {card.recipientName && ` ${t("for", { name: card.recipientName })}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {available && (
        <Section title={t("settingsTitle")}>
          <ActionForm action={saveGiftCardSettingsAction} submitLabel={tCommon("save")} className="space-y-4">
            <Hidden values={{ tenantId: page.tenantId }} />
            <CheckboxField name="enabled" label={t("enabled")} defaultChecked={settings.giftCardsEnabled} />
            <TextField
              name="validityMonths"
              type="number"
              inputMode="numeric"
              label={t("validityMonths")}
              defaultValue={settings.giftCardValidityMonths}
              required
            />
            <TextField
              name="amounts"
              label={t("amounts")}
              defaultValue={settings.giftCardAmounts.map(centsToInput).join(", ")}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                name="min"
                inputMode="decimal"
                label={t("min")}
                defaultValue={centsToInput(settings.giftCardMinCents)}
                required
              />
              <TextField
                name="max"
                inputMode="decimal"
                label={t("max")}
                defaultValue={centsToInput(settings.giftCardMaxCents)}
                required
              />
            </div>
            <p className="text-sm text-ink/70">{t("rules")}</p>
          </ActionForm>
        </Section>
      )}
    </div>
  );
}
