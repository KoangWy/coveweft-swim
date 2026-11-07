import { PencilSimple, Storefront } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Price } from "@/components/ui/price";
import { ProductImage } from "@/components/ui/product-image";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  adminProductHref,
  hasActiveProductFilters,
  parseAdminProductQuery,
  toAdminListProductsInput,
} from "@/features/admin/components/admin-query";
import { AdminPageHeader } from "@/features/admin/components/page-header";
import { ProductVisibilityButton } from "@/features/admin/components/product-visibility-button";
import { requireAdminPage } from "@/features/admin/components/session";
import { imageSources } from "@/features/catalog/components/image-sources";
import { ORDER_TIME_ZONE } from "@/features/orders/components/order-summary";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import { adminListProducts } from "@/server/admin";
import { listProducts, type ProductFacetValue } from "@/server/catalog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("productsPage.title") };
}

function facetOptions(values: ProductFacetValue[], allLabel: string, selected: string | undefined) {
  const options = [
    { value: "", label: allLabel },
    ...values.map((value) => ({ value: value.value, label: value.label })),
  ];

  if (selected && !values.some((value) => value.value === selected)) {
    options.push({ value: selected, label: selected });
  }

  return options;
}

export default async function AdminProductsPage({
  searchParams,
}: PageProps<"/[locale]/admin/products">) {
  await requireAdminPage();
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const format = await getFormatter();
  const query = parseAdminProductQuery(await searchParams);
  const [result, facetsResult] = await Promise.all([
    adminListProducts(toAdminListProductsInput(query)),
    listProducts({ locale, pageSize: 1 }),
  ]);
  const facets = facetsResult.ok ? facetsResult.data.facets : null;
  const crumbs = [{ label: t("admin.products") }];

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-6">
        <AdminPageHeader crumbs={crumbs} title={t("admin.productsPage.title")} />
        <ErrorState
          title={t("admin.productsPage.loadError")}
          description={t(`errors.${result.error.code}`)}
          action={
            <Link href="/admin/products" className={buttonClasses()}>
              {t("common.tryAgain")}
            </Link>
          }
        />
      </div>
    );
  }

  const list = result.data;
  const filtersActive = hasActiveProductFilters(query);
  const statusOptions = [
    { value: "all", label: t("admin.productsPage.all") },
    { value: "active", label: t("admin.productsPage.onSale") },
    { value: "hidden", label: t("admin.productsPage.hidden") },
  ];
  const stockOptions = [
    { value: "all", label: t("admin.productsPage.all") },
    { value: "in", label: t("admin.productsPage.stockIn") },
    { value: "low", label: t("admin.productsPage.stockLow") },
    { value: "out", label: t("admin.productsPage.stockOut") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        crumbs={crumbs}
        title={t("admin.productsPage.title")}
        description={t("admin.productsPage.intro")}
      />

      <form
        method="get"
        action={`/${locale}/admin/products`}
        aria-label={t("admin.productsPage.filters")}
        className="grid gap-4 rounded-md border border-neutral-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end"
      >
        <Input
          name="q"
          label={t("admin.productsPage.search")}
          placeholder={t("admin.productsPage.searchPlaceholder")}
          defaultValue={query.q}
          containerClassName="lg:col-span-2"
        />
        <Select
          name="category"
          label={t("admin.productsPage.category")}
          options={facetOptions(
            facets?.categories ?? [],
            t("admin.productsPage.all"),
            query.category,
          )}
          defaultValue={query.category ?? ""}
        />
        <Select
          name="type"
          label={t("admin.productsPage.type")}
          options={facetOptions(
            facets?.productTypes ?? [],
            t("admin.productsPage.all"),
            query.productType,
          )}
          defaultValue={query.productType ?? ""}
        />
        <Select
          name="status"
          label={t("admin.productsPage.sale")}
          options={statusOptions}
          defaultValue={query.status}
        />
        <Select
          name="stock"
          label={t("admin.productsPage.stock")}
          options={stockOptions}
          defaultValue={query.stock}
        />
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-6">
          <button type="submit" className={buttonClasses({ size: "sm" })}>
            {t("admin.productsPage.apply")}
          </button>
          {filtersActive ? (
            <Link
              href="/admin/products"
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              {t("admin.productsPage.clear")}
            </Link>
          ) : null}
        </div>
      </form>

      <p className="text-small text-neutral-600" aria-live="polite">
        {t("admin.productsPage.resultCount", { count: list.total })}
      </p>

      {list.items.length === 0 ? (
        <EmptyState
          title={t("admin.productsPage.emptyTitle")}
          description={t("admin.productsPage.emptyBody")}
          action={
            filtersActive ? (
              <Link href="/admin/products" className={buttonClasses()}>
                {t("admin.productsPage.clear")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[58rem] border-collapse text-left text-small">
              <caption className="sr-only">{t("admin.productsPage.title")}</caption>
              <thead>
                <tr className="border-b border-neutral-300 text-caption text-neutral-600">
                  <th scope="col" className="py-3 pr-4 font-semibold">
                    {t("admin.productsPage.colProduct")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("admin.productsPage.colCategory")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {t("admin.productsPage.colPrice")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("admin.productsPage.colStock")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("admin.productsPage.colStatus")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("admin.productsPage.colUpdated")}
                  </th>
                  <th scope="col" className="py-3 pl-4 text-right font-semibold">
                    {t("admin.productsPage.colActions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {list.items.map((product) => {
                  const thumb = imageSources(product.image).small;
                  return (
                    <tr key={product.id} className="align-middle">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 shrink-0 overflow-hidden rounded-md">
                            <ProductImage src={thumb} alt="" fallbackLabel="" sizes="48px" />
                          </div>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <Link
                              href={`/admin/products/${product.id}`}
                              className="font-semibold text-navy-900 hover:underline"
                            >
                              {product.name}
                            </Link>
                            <span className="text-caption text-neutral-600">{product.sku}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {product.category}
                        <span className="block text-caption text-neutral-600">
                          {product.productType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Price amount={product.priceVnd} locale={locale} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-navy-900 tabular-nums">
                          {t("admin.productsPage.stockLine", { count: product.totalStock })}
                        </span>
                        <span className="block text-caption text-neutral-600">
                          {t("admin.productsPage.variantLine", { count: product.variantCount })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap gap-1">
                          {product.isActive ? (
                            <Badge tone="success">{t("admin.productsPage.onSale")}</Badge>
                          ) : (
                            <Badge tone="warning">{t("admin.productsPage.hidden")}</Badge>
                          )}
                          {product.totalStock === 0 ? (
                            <Badge tone="soldout">{t("admin.productsPage.stockOut")}</Badge>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {format.dateTime(new Date(product.updatedAt), {
                          dateStyle: "medium",
                          timeZone: ORDER_TIME_ZONE,
                        })}
                      </td>
                      <td className="py-3 pl-4">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Link
                            href={`/admin/products/${product.id}`}
                            className={buttonClasses({ variant: "secondary", size: "sm" })}
                          >
                            <PencilSimple aria-hidden size={16} />
                            {t("admin.productsPage.edit")}
                          </Link>
                          <ProductVisibilityButton
                            productId={product.id}
                            name={product.name}
                            isActive={product.isActive}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-3 md:hidden">
            {list.items.map((product) => {
              const thumb = imageSources(product.image).small;
              return (
                <li
                  key={product.id}
                  className="flex flex-col gap-3 rounded-md border border-neutral-200 bg-white p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-16 shrink-0 overflow-hidden rounded-md">
                      <ProductImage src={thumb} alt="" fallbackLabel="" sizes="64px" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <h2 className="text-body font-semibold text-navy-900">{product.name}</h2>
                      <p className="text-caption text-neutral-600">{product.sku}</p>
                      <p className="text-small text-neutral-700">
                        {product.category}, {product.productType}
                      </p>
                      <Price amount={product.priceVnd} locale={locale} size="sm" />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-small text-navy-900">
                    <span className="tabular-nums">
                      {t("admin.productsPage.stockLine", { count: product.totalStock })}
                    </span>
                    <span className="text-neutral-600">
                      {t("admin.productsPage.variantLine", { count: product.variantCount })}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {product.isActive ? (
                      <Badge tone="success">{t("admin.productsPage.onSale")}</Badge>
                    ) : (
                      <Badge tone="warning">{t("admin.productsPage.hidden")}</Badge>
                    )}
                    {product.totalStock === 0 ? (
                      <Badge tone="soldout">{t("admin.productsPage.stockOut")}</Badge>
                    ) : null}
                    <span className="text-caption text-neutral-600">
                      {format.dateTime(new Date(product.updatedAt), {
                        dateStyle: "medium",
                        timeZone: ORDER_TIME_ZONE,
                      })}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className={buttonClasses({ variant: "secondary", size: "sm" })}
                    >
                      <PencilSimple aria-hidden size={16} />
                      {t("admin.productsPage.edit")}
                    </Link>
                    {product.isActive ? (
                      <Link
                        href={`/products/${encodeURIComponent(product.sku)}`}
                        className={buttonClasses({ variant: "ghost", size: "sm" })}
                      >
                        <Storefront aria-hidden size={16} />
                        {t("admin.productsPage.view")}
                      </Link>
                    ) : null}
                    <ProductVisibilityButton
                      productId={product.id}
                      name={product.name}
                      isActive={product.isActive}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <Pagination
            page={list.page}
            pageCount={list.pageCount}
            hrefForPage={(page) => adminProductHref(query, { page })}
            linkComponent={Link}
            labels={{
              nav: t("pagination.nav"),
              previous: t("pagination.previous"),
              next: t("pagination.next"),
              page: (page) => t("pagination.page", { page }),
            }}
          />
        </>
      )}
    </div>
  );
}
