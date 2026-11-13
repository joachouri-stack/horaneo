import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, TextArea, TextField } from "@/components/admin/fields";
import { StaffPhotoUpload } from "@/components/manager/StaffPhotoUpload";
import { ui } from "@/components/ui/styles";
import { pickLocalized } from "@/i18n/locales";
import { centsToInput } from "@/lib/format";
import { managerPage } from "@/lib/manager/page";
import { storage } from "@/lib/storage";
import { firstPlanWith } from "@/modules/billing/plans";
import { listProducts } from "@/modules/shop/products";
import { currentShopFulfillment } from "@/modules/shop/settings";
import {
  deleteProductAction,
  deleteVariantAction,
  moveProductAction,
  productPhotoAction,
  saveProductAction,
  saveShopSettingsAction,
  saveVariantAction,
} from "../../actions";

type ProductRow = Awaited<ReturnType<typeof listProducts>>[number];

/** Boutique (solution Commerce) : la gérante crée et gère ses produits. */
export default async function ShopPage({ params }: PageProps<"/[locale]/espace/[tenantId]/plus/boutique">) {
  const page = await managerPage(params, "shop");
  const [t, tCommon] = await Promise.all([getTranslations("manager.shop"), getTranslations("common")]);
  const available = Boolean(page.tenant.features.commerce);
  const [products, fulfillment] = available
    ? await page.db(
        async (tx) => [await listProducts(tx, page.tenantId), await currentShopFulfillment(tx)] as const,
      )
    : [[], null];
  const locale = page.tenant.defaultLocale as "fr";
  const store = storage();

  const fields = (product: ProductRow | null) => {
    const key = product?.id ?? "new";
    return (
      <>
        <Hidden values={{ tenantId: page.tenantId, id: product?.id }} />
        <TextField
          id={`name-${key}`}
          name="name"
          label={t("name")}
          defaultValue={product ? pickLocalized(product.name, locale) : undefined}
          required
        />
        <TextArea
          id={`description-${key}`}
          name="description"
          label={t("description")}
          hint={t("descriptionHint")}
          rows={3}
          defaultValue={product?.description ? pickLocalized(product.description, locale) : undefined}
        />
        <TextField
          id={`category-${key}`}
          name="category"
          label={t("category")}
          hint={t("categoryHint")}
          list="shop-categories"
          defaultValue={product?.category ?? undefined}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            id={`price-${key}`}
            name="price"
            inputMode="decimal"
            label={t("price", { currency: page.fmt.currency })}
            defaultValue={product ? centsToInput(product.priceCents) : undefined}
            required
          />
          <TextField
            id={`compare-${key}`}
            name="compareAtPrice"
            inputMode="decimal"
            label={t("compareAtPrice", { currency: page.fmt.currency })}
            hint={t("compareAtPriceHint")}
            defaultValue={
              product?.compareAtPriceCents == null ? undefined : centsToInput(product.compareAtPriceCents)
            }
          />
        </div>
        <TextField
          id={`stock-${key}`}
          name="stock"
          inputMode="numeric"
          label={t("stock")}
          hint={t("stockHint")}
          defaultValue={product?.stockQuantity == null ? undefined : String(product.stockQuantity)}
        />
        <CheckboxField
          name="isActive"
          label={t("active")}
          defaultChecked={product ? product.isActive : true}
        />
      </>
    );
  };

  const variantFields = (product: ProductRow, variant: ProductRow["variants"][number] | null) => {
    const key = variant?.id ?? `new-${product.id}`;
    return (
      <>
        <Hidden values={{ tenantId: page.tenantId, productId: product.id, id: variant?.id }} />
        <TextField
          id={`vname-${key}`}
          name="name"
          label={t("variantName")}
          hint={t("variantNameHint")}
          defaultValue={variant ? pickLocalized(variant.name, locale) : undefined}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            id={`vprice-${key}`}
            name="price"
            inputMode="decimal"
            label={t("variantPrice", { currency: page.fmt.currency })}
            hint={t("variantPriceHint")}
            defaultValue={variant?.priceCents == null ? undefined : centsToInput(variant.priceCents)}
          />
          <TextField
            id={`vstock-${key}`}
            name="stock"
            inputMode="numeric"
            label={t("stock")}
            hint={t("stockHint")}
            defaultValue={variant?.stockQuantity == null ? undefined : String(variant.stockQuantity)}
          />
        </div>
        <CheckboxField
          name="isActive"
          label={t("active")}
          defaultChecked={variant ? variant.isActive : true}
        />
      </>
    );
  };

  const stockLabel = (product: ProductRow) =>
    product.stockQuantity === null
      ? t("stockUntracked")
      : product.stockQuantity === 0
        ? t("stockOut")
        : t("stockLeft", { count: product.stockQuantity });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
        {t("title")}
      </h1>
      {!available ? (
        <p className={ui.card}>
          {t("unavailable", {
            plan: (await page.db((tx) => firstPlanWith(tx, "commerce", page.locale))) ?? "none",
          })}
        </p>
      ) : (
        <>
          <p className="text-ink/80">{t("intro")}</p>
          {fulfillment && (
            <details className={ui.card}>
              <summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold text-night">
                {t("fulfillmentTitle")}
              </summary>
              <p className="mt-2 text-sm text-ink/70">{t("fulfillmentHint")}</p>
              <ActionForm
                action={saveShopSettingsAction}
                submitLabel={tCommon("save")}
                className="mt-4 space-y-4"
              >
                <Hidden values={{ tenantId: page.tenantId }} />
                <div>
                  <CheckboxField name="pickup" label={t("pickup")} defaultChecked={fulfillment.pickup} />
                  <CheckboxField
                    name="delivery"
                    label={t("delivery")}
                    defaultChecked={fulfillment.delivery}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    name="deliveryFee"
                    inputMode="decimal"
                    label={t("deliveryFee", { currency: page.fmt.currency })}
                    hint={t("deliveryFeeHint")}
                    defaultValue={
                      fulfillment.deliveryFeeCents ? centsToInput(fulfillment.deliveryFeeCents) : undefined
                    }
                  />
                  <TextField
                    name="freeDeliveryFrom"
                    inputMode="decimal"
                    label={t("freeDeliveryFrom", { currency: page.fmt.currency })}
                    hint={t("freeDeliveryFromHint")}
                    defaultValue={
                      fulfillment.freeDeliveryFromCents === null
                        ? undefined
                        : centsToInput(fulfillment.freeDeliveryFromCents)
                    }
                  />
                </div>
              </ActionForm>
            </details>
          )}
          {/* Catégories déjà utilisées, proposées pendant la saisie. */}
          <datalist id="shop-categories">
            {[...new Set(products.map((product) => product.category).filter(Boolean))].map((category) => (
              <option key={category} value={category!} />
            ))}
          </datalist>
          {products.length === 0 ? (
            <p className="text-ink/70">{t("empty")}</p>
          ) : (
            <ul className="space-y-3">
              {products.map((product, index) => (
                <li key={product.id}>
                  <details className={ui.card}>
                    <summary className="flex cursor-pointer items-center gap-4">
                      {product.photoKey ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={store.publicUrl(product.photoKey)}
                          alt=""
                          className="size-16 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-mist-50 text-ink-soft"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="size-6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M5.5 8.5h13l-1 11.5h-11zM9 8.5V7a3 3 0 0 1 6 0v1.5" />
                          </svg>
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-lg font-semibold ${product.isActive ? "text-night" : "text-ink/70"}`}
                        >
                          {pickLocalized(product.name, locale)}
                        </span>
                        <span className="block text-sm text-ink/70">
                          {product.category && <>{product.category} · </>}
                          {page.fmt.money(product.priceCents, product.currency)} ·{" "}
                          {product.variants.length > 0
                            ? t("variantCount", { count: product.variants.length })
                            : stockLabel(product)}
                          {!product.isActive && <> · {t("hidden")}</>}
                        </span>
                      </span>
                    </summary>
                    <div className="mt-4 space-y-4">
                      <div>
                        <p className={ui.label}>{t("photo")}</p>
                        <StaffPhotoUpload
                          tenantId={page.tenantId}
                          staffId={product.id}
                          hasPhoto={Boolean(product.photoKey)}
                          action={productPhotoAction}
                        />
                      </div>
                      <ActionForm
                        action={saveProductAction}
                        submitLabel={tCommon("save")}
                        className="space-y-4"
                      >
                        {fields(product)}
                      </ActionForm>
                      {/* Variantes : taille, couleur, contenance… avec leur prix et leur stock. */}
                      <section
                        aria-labelledby={`variantes-${product.id}`}
                        className="space-y-3 border-t border-hairline pt-4"
                      >
                        <h3 id={`variantes-${product.id}`} className="font-semibold text-night">
                          {t("variants")}
                        </h3>
                        <p className="text-sm text-ink/70">{t("variantsHint")}</p>
                        {product.variants.map((variant) => (
                          <div key={variant.id} className="rounded-xl border border-hairline p-3">
                            <ActionForm
                              action={saveVariantAction}
                              submitLabel={tCommon("save")}
                              className="space-y-3"
                            >
                              {variantFields(product, variant)}
                            </ActionForm>
                            <ActionForm
                              action={deleteVariantAction}
                              submitLabel={t("deleteVariant")}
                              variant="link"
                              confirm={t("deleteVariantConfirm")}
                              className="mt-2"
                            >
                              <Hidden
                                values={{ tenantId: page.tenantId, productId: product.id, id: variant.id }}
                              />
                            </ActionForm>
                          </div>
                        ))}
                        <details className="rounded-xl border border-dashed border-hairline p-3">
                          <summary className="flex min-h-11 cursor-pointer items-center font-medium text-night">
                            + {t("newVariant")}
                          </summary>
                          <ActionForm
                            action={saveVariantAction}
                            submitLabel={tCommon("save")}
                            resetOnSuccess
                            className="mt-3 space-y-3"
                          >
                            {variantFields(product, null)}
                          </ActionForm>
                        </details>
                      </section>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        {index > 0 && (
                          <ActionForm action={moveProductAction} submitLabel={t("moveUp")} variant="link">
                            <Hidden values={{ tenantId: page.tenantId, id: product.id, direction: "up" }} />
                          </ActionForm>
                        )}
                        {index < products.length - 1 && (
                          <ActionForm action={moveProductAction} submitLabel={t("moveDown")} variant="link">
                            <Hidden values={{ tenantId: page.tenantId, id: product.id, direction: "down" }} />
                          </ActionForm>
                        )}
                        <ActionForm
                          action={deleteProductAction}
                          submitLabel={t("delete")}
                          variant="link"
                          confirm={t("deleteConfirm")}
                        >
                          <Hidden values={{ tenantId: page.tenantId, id: product.id }} />
                        </ActionForm>
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
          <details className={ui.card} open={products.length === 0}>
            <summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold text-night">
              + {t("new")}
            </summary>
            <p className="mt-2 text-sm text-ink/70">{t("newHint")}</p>
            <ActionForm
              action={saveProductAction}
              submitLabel={tCommon("save")}
              resetOnSuccess
              className="mt-4 space-y-4"
            >
              {fields(null)}
            </ActionForm>
          </details>
        </>
      )}
    </div>
  );
}
