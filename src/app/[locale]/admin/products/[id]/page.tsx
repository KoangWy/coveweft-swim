import { Storefront } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { AdminProductEditor } from "@/features/admin/components/product-editor-form";
import {
  AdminProductImages,
  type AdminImageItem,
} from "@/features/admin/components/product-images";
import { AdminPageHeader } from "@/features/admin/components/page-header";
import { ProductVisibilityButton } from "@/features/admin/components/product-visibility-button";
import { loadAdminProductOr404 } from "@/features/admin/components/load-admin";
import { requireAdminPage } from "@/features/admin/components/session";
import { StockAdjuster } from "@/features/admin/components/stock-adjuster";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import { listProducts } from "@/server/catalog";
import { imageUrl } from "@/server/media";

type Props = PageProps<"/[locale]/admin/products/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireAdminPage();
  const { id } = await params;
  const product = await loadAdminProductOr404(id);
  return { title: product.name };
}

export default async function AdminProductEditorPage({ params }: Props) {
  await requireAdminPage();
  const { id } = await params;
  const product = await loadAdminProductOr404(id);
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const facetsResult = await listProducts({ locale, pageSize: 1 });
  const facets = facetsResult.ok ? facetsResult.data.facets : null;
  const translations = new Map(product.translations.map((row) => [row.locale, row]));
  const images: AdminImageItem[] = product.images.map((image, index) => ({
    id: image.id,
    source: image.source,
    isVisible: image.isVisible,
    thumb: imageUrl(image, 480),
    full: imageUrl(image, 1600),
    alt: t("admin.images.imageAlt", { name: product.name, index: index + 1 }),
  }));
  const crumbs = [{ label: t("admin.products"), href: "/admin/products" }, { label: product.name }];
  const optionSets = {
    categoryOptions:
      facets?.categories.map((value) => ({ value: value.value, label: value.label })) ?? [],
    productTypeOptions:
      facets?.productTypes.map((value) => ({ value: value.value, label: value.label })) ?? [],
    genderOptions:
      facets?.genders.map((value) => ({ value: value.value, label: value.label })) ?? [],
  };

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        crumbs={crumbs}
        title={product.name}
        description={`${product.sku} · ${product.category} · ${product.productType}`}
        badge={
          product.isActive ? (
            <Badge tone="success">{t("admin.productsPage.onSale")}</Badge>
          ) : (
            <Badge tone="warning">{t("admin.productsPage.hidden")}</Badge>
          )
        }
        actions={
          <>
            {product.isActive ? (
              <Link
                href={`/products/${encodeURIComponent(product.sku)}`}
                className={buttonClasses({ variant: "secondary" })}
              >
                <Storefront aria-hidden size={18} />
                {t("admin.editorPage.viewStorefront")}
              </Link>
            ) : null}
            <ProductVisibilityButton
              productId={product.id}
              name={product.name}
              isActive={product.isActive}
              size="md"
            />
          </>
        }
      />

      <section
        aria-labelledby="admin-product-details"
        className="rounded-md border border-neutral-200 bg-white p-5 sm:p-6"
      >
        <h2 id="admin-product-details" className="text-heading-sm font-semibold text-navy-900">
          {t("admin.editorPage.details")}
        </h2>
        <p className="mt-1 text-small text-neutral-600">{t("admin.editorPage.intro")}</p>
        <div className="mt-5">
          <AdminProductEditor
            product={{
              id: product.id,
              sku: product.sku,
              name: product.name,
              category: product.category,
              productType: product.productType,
              gender: product.gender,
              priceVnd: product.priceVnd,
              descriptionEn: translations.get("en")?.description ?? "",
              descriptionVi: translations.get("vi")?.description ?? "",
              isActive: product.isActive,
            }}
            {...optionSets}
          />
        </div>
      </section>

      <section
        aria-labelledby="admin-product-variants"
        className="rounded-md border border-neutral-200 bg-white p-5 sm:p-6"
      >
        <h2 id="admin-product-variants" className="text-heading-sm font-semibold text-navy-900">
          {t("admin.variants.title")}
        </h2>
        <p className="mt-1 text-small text-neutral-600">{t("admin.variants.intro")}</p>

        {product.variants.length === 0 ? (
          <p className="mt-4 text-small text-neutral-700">{t("admin.variants.empty")}</p>
        ) : (
          <>
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[40rem] border-collapse text-left text-small">
                <caption className="sr-only">{t("admin.variants.title")}</caption>
                <thead>
                  <tr className="border-b border-neutral-300 text-caption text-neutral-600">
                    <th scope="col" className="py-3 pr-4 font-semibold">
                      {t("admin.variants.option")}
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      {t("admin.variants.sku")}
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      {t("admin.variants.stock")}
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      {t("admin.variants.status")}
                    </th>
                    <th scope="col" className="py-3 pl-4 text-right font-semibold">
                      {t("admin.variants.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {product.variants.map((variant) => (
                    <tr key={variant.id}>
                      <td className="py-3 pr-4 font-semibold text-navy-900">
                        {variant.optionLabel}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{variant.variantSku}</td>
                      <td className="px-4 py-3 text-navy-900 tabular-nums">{variant.stock}</td>
                      <td className="px-4 py-3">
                        {variant.inStock ? (
                          <Badge tone="success">{t("admin.variants.inStock")}</Badge>
                        ) : (
                          <Badge tone="soldout">{t("admin.variants.outOfStock")}</Badge>
                        )}
                      </td>
                      <td className="py-3 pl-4 text-right">
                        <StockAdjuster
                          variantId={variant.id}
                          optionLabel={variant.optionLabel}
                          variantSku={variant.variantSku}
                          stock={variant.stock}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="mt-4 flex flex-col gap-3 md:hidden">
              {product.variants.map((variant) => (
                <li
                  key={variant.id}
                  className="flex flex-col gap-2 rounded-md border border-neutral-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <h3 className="text-body font-semibold text-navy-900">
                        {variant.optionLabel}
                      </h3>
                      <p className="text-caption text-neutral-600">{variant.variantSku}</p>
                    </div>
                    {variant.inStock ? (
                      <Badge tone="success">{t("admin.variants.inStock")}</Badge>
                    ) : (
                      <Badge tone="soldout">{t("admin.variants.outOfStock")}</Badge>
                    )}
                  </div>
                  <p className="text-small text-navy-900 tabular-nums">
                    {t("admin.variants.stockLine", { count: variant.stock })}
                  </p>
                  <div>
                    <StockAdjuster
                      variantId={variant.id}
                      optionLabel={variant.optionLabel}
                      variantSku={variant.variantSku}
                      stock={variant.stock}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section
        aria-labelledby="admin-product-images"
        className="rounded-md border border-neutral-200 bg-white p-5 sm:p-6"
      >
        <h2 id="admin-product-images" className="text-heading-sm font-semibold text-navy-900">
          {t("admin.images.title")}
        </h2>
        <p className="mt-1 max-w-[75ch] text-small text-neutral-600">{t("admin.images.intro")}</p>
        <div className="mt-5">
          <AdminProductImages
            key={images.map((image) => `${image.id}:${image.isVisible}`).join("|")}
            productId={product.id}
            images={images}
            fallbackLabel={t("catalog.imageUnavailable")}
          />
        </div>
      </section>
    </div>
  );
}
