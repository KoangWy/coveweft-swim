# Architecture

COVEWEFT Swim is a single Next.js App Router application backed by Supabase
(Postgres, Auth, and Storage). The storefront and the admin area share one
codebase. Business rules that change stock, orders, or payments live in
Postgres functions so each change runs in a single transaction.

## Source layout

| Path                | Purpose                                                                  |
| ------------------- | ------------------------------------------------------------------------ |
| `src/app/[locale]/` | Storefront, account, and admin routes, one tree per locale               |
| `src/app/api/`      | HTTP route handlers (chat stream, internal callbacks)                    |
| `src/components/`   | Shared UI, layout, and form controls                                     |
| `src/features/`     | Feature modules: catalog, auth, cart, checkout, orders, admin, assistant |
| `src/server/`       | Services, repositories, provider adapters, and shared error contracts    |
| `src/lib/`          | Supabase clients, i18n helpers, money and configuration helpers          |
| `src/messages/`     | English and Vietnamese UI dictionaries                                   |
| `src/i18n/`         | Routing, navigation, and request configuration for `next-intl`           |
| `supabase/`         | Local stack configuration, migrations, RPCs, and seed data               |
| `data/`             | Catalog export, translations, size guides, and import reports            |
| `scripts/`          | Demo, reset, import, and media tooling                                   |
| `tests/`            | Unit, integration, and end-to-end tests                                  |
| `docs/`             | Architecture and setup documentation                                     |

## Request flow

```text
Browser
  -> src/proxy.ts                 locale detection and redirects
  -> src/app/[locale]/...         layout and page rendering
  -> server action / route handler (thin HTTP or form boundary)
  -> src/server/<domain>/         service: validate input, call RPC or query
  -> Postgres function (RPC)      transaction: order, stock, payment rules
  -> Postgres with RLS            reads scoped to the signed-in user
```

Boundaries:

- **Pages and layouts** render data and compose components. They do not contain
  business rules or write to the database directly.
- **Server actions** parse the submitted form, call one service, and return the
  result. They stay thin: no pricing, stock, or state-transition logic.
- **Services** in `src/server/<domain>/` export async functions. Every input is
  validated with a zod schema exported next to the function as `<Name>Input`.
  Services return `Result<T>` and never return display text.
- **Postgres functions** own every mutation that touches stock, orders, or
  payments. They run in one transaction, lock the affected rows, and re-check
  their preconditions. Services call them through `supabase.rpc(...)`.
- **Row Level Security** protects reads and user-owned rows. Tables for orders,
  stock, and payments do not grant direct write access to clients.

## Database model

Migrations in `supabase/migrations` are the source of truth. Every table has
row level security enabled.

| Table                    | Purpose                                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`               | One row per auth user: `role` (`customer` or `admin`), contact fields, and privacy consent evidence (`privacy_consent_at`, `privacy_policy_version`). |
| `products`               | Normalised catalog row: SKU, attributes, integer VND price, `is_active`, and an unaccented `search_text` generated column.                            |
| `product_translations`   | Localized description and caption per product and locale.                                                                                             |
| `attribute_translations` | Localized labels for catalog attribute values.                                                                                                        |
| `product_variants`       | Sellable option per product with `variant_sku`, the source `option_label`, an optional `size_guide_key`, and non-negative stock.                      |
| `product_images`         | Studio (`release`) and administrator (`upload`) images with `kind`, `source`, `path`, `position`, and `is_visible`.                                   |
| `store_settings`         | Single row that holds the Standard and Express fees, the free-shipping threshold, and the payment window.                                             |
| `cart_items`             | One row per customer and variant. Adding to the cart does not reserve stock.                                                                          |
| `orders`                 | Order header with status, payment state, delivery snapshot, price snapshot, idempotency key, and payment deadline.                                    |
| `order_items`            | Immutable product, variant, price, and quantity snapshot.                                                                                             |
| `payment_attempts`       | One row per simulated bank transfer attempt.                                                                                                          |
| `order_events`           | Append-only status history with actor and reason.                                                                                                     |
| `stock_adjustments`      | Audit trail for administrator stock changes.                                                                                                          |

A trigger on `auth.users` creates the profile from the sign-up metadata and
rejects a sign-up that does not carry a privacy policy version. The consent
timestamp is written by the server, not supplied by the browser. Provisioning
scripts that create users through the Auth Admin API must include
`privacy_policy_version` in `user_metadata`; the trigger applies to every insert
into `auth.users`.

`products.search_text`, `product_translations.search_text`, and their trigram
indexes use `public.immutable_unaccent`, an immutable wrapper around the
`unaccent` extension. Catalog search can therefore match Vietnamese text with
or without diacritics.

### Catalog search view

`public.catalog_products` is a view over `products`, its English and Vietnamese
translation rows, and the variant stock summary. It runs with
`security_invoker = true`, so the catalog row level security policies still
apply. The view exposes:

- the product columns and `description_en`, `caption_en`, `description_vi`,
  `caption_vi`, with the Vietnamese copy falling back to the English
  translation and then to the source copy;
- `search_text_all`, the unaccented concatenation of the name, the source
  description, and both translations;
- `in_stock`, `variant_labels`, `available_variant_labels`, `total_stock`, and
  `variant_count`.

The catalog service filters and sorts this view directly, which keeps search,
facets, and pagination in one query. `product_images.is_visible` hides an image
from the storefront without deleting its metadata. The image SELECT policy
enforces visibility for anonymous and customer clients, not only the service
filter; administrators can still read hidden rows in the editor.

The `product-uploads` Storage bucket is public for reads and limited to WebP,
JPEG, and PNG files of at most 5 MiB. Administrator uploads write through the
secret key after the service checks the caller role; the storefront reads the
public object URL.

### Row level security

- Catalog tables and `store_settings` are readable by `anon` and
  `authenticated`. Inactive products are visible only to administrators.
  Hidden product images are readable only by administrators.
- `profiles`, `cart_items`, `orders`, `order_items`, `payment_attempts`, and
  `order_events` are scoped to their owner. Administrators can read all of them.
- Customers write only `cart_items` and the editable profile columns.
- `orders`, `order_items`, `payment_attempts`, `order_events`, and
  `product_variants.stock` have no client write grant. They change only through
  the `SECURITY DEFINER` functions.
- The `product_variants` INSERT grant excludes `stock`, so a new variant starts
  at the default zero. Initial stock goes through `admin_adjust_stock`, which
  writes a `stock_adjustments` row. Trusted service-role seeding keeps its own
  table privileges.
- `profiles.role` and the consent columns are outside the authenticated update
  grant; a trigger also rejects a role change from a signed-in non-admin.

## Shared contracts

### `Result<T>` and `ErrorCode`

Defined in `src/server/errors.ts`.

```ts
type Result<T> =
  { ok: true; data: T } | { ok: false; error: { code: ErrorCode; details?: unknown } };
```

Use `ok(data)` and `fail(code, details?)` to build results. `details` carries
structured context for logging or form errors; it is never user-facing text.

| Code                    | Meaning                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `VALIDATION_ERROR`      | Input did not pass the service schema                             |
| `UNAUTHENTICATED`       | The request has no signed-in user                                 |
| `INVALID_CREDENTIALS`   | The email or password is wrong                                    |
| `EMAIL_TAKEN`           | An account already uses the email address                         |
| `RATE_LIMITED`          | The auth server or another limiter rejected the request           |
| `FORBIDDEN`             | The signed-in user lacks the required role or ownership           |
| `NOT_FOUND`             | The requested record does not exist or is not visible             |
| `CONFLICT`              | The action conflicts with the current state or an idempotency key |
| `PRODUCT_UNAVAILABLE`   | The product is hidden or no longer sellable                       |
| `OUT_OF_STOCK`          | A variant does not have enough stock for the request              |
| `CART_CHANGED`          | Cart lines changed while the customer was checking out            |
| `ORDER_NOT_CANCELLABLE` | The order state does not allow cancellation                       |
| `ORDER_STATE_CONFLICT`  | The order is not in the state required by the action              |
| `PAYMENT_FAILED`        | A simulated payment attempt failed                                |
| `PAYMENT_NOT_ALLOWED`   | The order cannot be paid with its method or in its current state  |
| `PAYMENT_EXPIRED`       | The payment window for the order has passed                       |
| `CONSENT_REQUIRED`      | The privacy policy must be accepted before creating an account    |
| `QUOTA_EXCEEDED`        | A per-user or global usage limit was reached                      |
| `AI_NOT_CONFIGURED`     | No AI provider key is configured for this environment             |
| `AI_UNAVAILABLE`        | Both the primary and fallback AI providers failed                 |
| `INTERNAL`              | An unexpected server error                                        |

The frontend maps each code to `errors.<CODE>` in `src/messages/en.json` and
`src/messages/vi.json`. Services and route handlers must not return translated
sentences.

The issue tracker used a few alternate names before the database layer merged.
The shared union keeps the existing codes: `AUTH_REQUIRED` is
`UNAUTHENTICATED`, `VALIDATION_FAILED` is `VALIDATION_ERROR`, and
`PAYMENT_WINDOW_EXPIRED` is `PAYMENT_EXPIRED`.

### Validation details

`VALIDATION_ERROR` carries `details.issues`, an array of stable field codes:

```ts
type ValidationIssue = {
  field: string; // dotted input path, or "" for a form-level issue
  code:
    | "required"
    | "invalid_type"
    | "invalid_format"
    | "invalid_value"
    | "too_small"
    | "too_large"
    | "unknown_field"
    | "invalid_range"
    | "require_one_of"
    | "at_least_one_field"
    | "missing_create_fields"
    | "unknown";
  params?: Record<string, unknown>;
};
```

The server never returns validation prose. `params` carries structured
constraint data such as `minimum`, `maximum`, `inclusive`, `type`, `format`,
`values`, or `keys`. The frontend owns the English and Vietnamese wording for
each code and field. Cross-field rules use `invalid_range` (for example an
inverted price range), `require_one_of` (exactly one of two fields), and
`at_least_one_field` (a profile patch with no fields).

### Money

Prices are integer VND amounts (`number`), stored and calculated without
floating point. `formatVnd(amount, locale)` in `src/lib/money.ts` formats them
for display and rejects fractional input. Shipping fees and the free-shipping
threshold come from the database `store_settings` row, not from the browser or
from environment variables.

### Store settings

The single `store_settings` row in Postgres is the source of truth for
shipping fees, the free-shipping threshold, and other storefront values. The
UI, server services, Postgres functions, and the assistant all read that row.
Environment variables do not carry pricing values.

## Application services

Services live in `src/server/<domain>/` and are the only layer the UI calls.
Every function is async, validates its input with the exported zod schema, and
returns `Result<T>`. Import them from the domain index (`@/server/catalog`,
`@/server/cart`, and so on). The schemas are exported next to the functions as
`<Name>Input`.

### Catalog

```ts
listProducts(input: unknown): Promise<Result<ProductList>>;
getProductBySku(input: unknown): Promise<Result<ProductDetail>>;
getStoreSettings(): Promise<Result<StoreSettings>>;
getSizeGuide(input: unknown): Promise<Result<SizeGuide>>;
garmentForProductType(productType: string): SizeGuideGarment | null;
groupFromSizeGuideKey(key: string): string | null;
normalizeSearchTerm(value: string): string;
```

`ListProductsInput` accepts `locale` (`en` or `vi`, default `en`), `q`,
`category`, `gender` (one value, or an array of up to 10 values that matches any),
`productType`, `priceMin`, `priceMax`, `material`,
`features` (array, matches any), `size`, `inStock`, `sort`
(`newest`, `price-asc`, `price-desc`, `name-asc`), `page` (default 1), and
`pageSize` (default 12, maximum 60). `GetProductBySkuInput` is
`{ locale, sku }`. `GetSizeGuideInput` is `{ locale, key?, group?, garment? }`
and needs a key or a group.

```ts
type ProductList = {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  facets: ProductFacets;
};

type ProductListItem = {
  id: string;
  sku: string;
  name: string;
  priceVnd: number;
  category: string;
  gender: string;
  productType: string;
  material: string | null;
  color: string | null;
  features: string[];
  inStock: boolean;
  description: string | null;
  caption: string | null;
  images: ProductImage[];
};

type ProductDetail = ProductListItem & {
  articleId: string | null;
  collection: string | null;
  colorFamily: string | null;
  pattern: string | null;
  fabricDesc: string | null;
  sleeve: string | null;
  neckline: string | null;
  fit: string | null;
  length: string | null;
  closure: string | null;
  lining: string | null;
  season: string | null;
  brand: string | null;
  isActive: boolean;
  attributes: ProductAttribute[];
  variants: ProductVariant[];
  sizeGuide: SizeGuide | null;
};

type ProductImage = {
  id: string;
  kind: "studio" | "community";
  source: "release" | "upload";
  path: string;
  position: number;
  isVisible: boolean;
};

type ProductVariant = {
  id: string;
  variantSku: string;
  optionLabel: string;
  sizeGuideKey: string | null;
  stock: number;
  position: number;
  inStock: boolean;
};

type ProductAttribute = { key: string; value: string; valueLabel: string };

type ProductFacetValue = { value: string; label: string; count: number };

type ProductFacets = {
  categories: ProductFacetValue[];
  genders: ProductFacetValue[];
  productTypes: ProductFacetValue[];
  materials: ProductFacetValue[];
  features: ProductFacetValue[];
  sizes: ProductFacetValue[];
  price: { minVnd: number; maxVnd: number };
};

type SizeGuideGarment = "tops" | "bottoms" | "full-body";

type SizeGuide = {
  group: string;
  garment: SizeGuideGarment;
  unit: "cm";
  ageUnit: "months";
  notice: string;
  measurements: string[];
  rows: SizeGuideRow[];
  highlightKey: string | null;
};

type SizeGuideRow = {
  sizeGuideKey: string;
  label: string;
  ranges: Record<string, [number, number]>;
};

type StoreSettings = {
  standardShippingFeeVnd: number;
  expressShippingFeeVnd: number;
  freeStandardShippingThresholdVnd: number;
  paymentWindowMinutes: number;
};
```

Search matches the name, the English description, and the Vietnamese
translation with or without diacritics. Facet labels come from
`attribute_translations` and fall back to the source value. The size facet uses
variants that are in stock, so selecting a size returns buyable products. The
size guide is read from `data/size-guides/demo-size-guide.json`; the product
detail resolves the garment from the product type and the group from a variant
`sizeGuideKey`.

`src/lib/store-settings.ts` keeps its UI signature
`getStoreSettings(): Promise<StoreSettings>` and now reads through
`databaseStoreSettingsSource`, so the storefront uses the database row.

### Cart

```ts
getCart(): Promise<Result<Cart>>;
addToCart(input: unknown): Promise<Result<Cart>>;
updateCartItem(input: unknown): Promise<Result<Cart>>;
removeCartItem(input: unknown): Promise<Result<Cart>>;
```

`AddToCartInput` and `UpdateCartItemInput` are
`{ variantId: string; quantity: number }` with a quantity from 1 to 99.
`RemoveCartItemInput` is `{ variantId: string }`. Removing an absent line is
not an error.

`addToCart` calls `add_cart_item`, which accumulates with `ON CONFLICT DO
UPDATE` and then locks the variant row, in the same lock order as `place_order`
(cart row, then variant). The combined line is capped at 99 and checked against
the locked stock, so concurrent additions from several tabs cannot lose an
increment and cannot deadlock with a checkout. The service still reloads the
full cart after the function returns.

```ts
type Cart = {
  items: CartLine[];
  issues: CartIssue[];
  itemCount: number;
  subtotalVnd: number;
};

type CartLine = {
  variantId: string;
  quantity: number;
  productId: string | null;
  sku: string | null;
  productName: string | null;
  variantSku: string | null;
  optionLabel: string | null;
  sizeGuideKey: string | null;
  unitPriceVnd: number | null;
  lineTotalVnd: number;
  stock: number | null;
  image: ProductImage | null;
  issues: CartIssueCode[];
};

type CartIssueCode = "PRODUCT_UNAVAILABLE" | "OUT_OF_STOCK";

type CartIssue = {
  variantId: string;
  code: CartIssueCode;
  availableStock?: number;
};
```

Lines whose product or variant is hidden keep their `variantId` and quantity
but have null product fields, so the UI can show the problem and offer removal.

### Checkout

```ts
quoteCheckout(input: unknown): Promise<Result<CheckoutQuote>>;
placeOrder(input: unknown): Promise<Result<OrderDetail>>;
calculateShippingFee(
  subtotalVnd: number,
  shippingMethod: ShippingMethod,
  settings: StoreSettings,
): number;
```

`QuoteCheckoutInput` is `{ shippingMethod: "standard" | "express" }`.
`PlaceOrderInput` is `{ idempotencyKey, recipientName, recipientPhone,
shippingAddress, shippingMethod, paymentMethod }`.

```ts
type CheckoutQuote = {
  items: CartLine[];
  subtotalVnd: number;
  shippingMethod: ShippingMethod;
  shippingFeeVnd: number;
  totalVnd: number;
  freeShippingThresholdVnd: number;
  paymentWindowMinutes: number;
};
```

The quote reads prices from the catalog and fees from `store_settings`; the
browser never sends a total. Standard shipping is free at or above the
threshold and Express is never free. An empty cart returns `VALIDATION_ERROR`
with `details.reason = "empty_cart"`; a cart with unavailable lines returns
`PRODUCT_UNAVAILABLE` or `OUT_OF_STOCK` with `details.issues`. `placeOrder`
calls `place_order`, which recalculates and re-checks everything in one
transaction. A repeated `idempotencyKey` returns the same order.

### Orders

```ts
listMyOrders(input?: unknown): Promise<Result<OrderList>>;
getMyOrder(input: unknown): Promise<Result<OrderDetail>>;
cancelMyOrder(input: unknown): Promise<Result<OrderDetail>>;
simulatePayment(input: unknown): Promise<Result<OrderDetail>>;
```

`ListMyOrdersInput` is `{ status?, page?, pageSize? }`. `GetMyOrderInput` and
`CancelMyOrderInput` are `{ id: string }`. `SimulatePaymentInput` is
`{ orderId: string; outcome: "succeeded" | "failed" }`.

```ts
type OrderSummary = {
  id: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
  shippingMethod: ShippingMethod;
  shippingFeeVnd: number;
  itemsSubtotalVnd: number;
  totalVnd: number;
  paymentDueAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  items: OrderItem[];
};

type OrderDetail = OrderSummary & {
  cancelledBy: string | null;
  paymentAttempts: PaymentAttempt[];
  events: OrderEvent[];
};

type OrderItem = {
  id: string;
  variantId: string | null;
  productId: string | null;
  sku: string;
  variantSku: string;
  productName: string;
  optionLabel: string;
  unitPriceVnd: number;
  quantity: number;
  lineTotalVnd: number;
};

type PaymentAttempt = {
  id: string;
  outcome: "succeeded" | "failed";
  createdAt: string;
};

type OrderEvent = {
  id: number;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  fromPaymentStatus: PaymentStatus | null;
  toPaymentStatus: PaymentStatus;
  actorRole: "customer" | "admin" | "system";
  reason: string | null;
  createdAt: string;
};

type OrderList = {
  items: OrderSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};
```

`OrderStatus`, `PaymentStatus`, `PaymentMethod`, and `ShippingMethod` are the
unions in `src/server/commerce/types.ts`.

### Auth

```ts
signUp(input: unknown): Promise<Result<AuthSession>>;
signIn(input: unknown): Promise<Result<AuthSession>>;
signOut(): Promise<Result<{ signedOut: true }>>;
getCurrentUser(): Promise<Result<CurrentUser | null>>;
updateProfile(input: unknown): Promise<Result<CurrentUser>>;
```

`SignUpInput` is `{ email, password, fullName, consent, policyVersion? }`.
`SignInInput` is `{ email, password }`. `UpdateProfileInput` is
`{ fullName?, phone?, defaultAddress? }` with nullable strings.

```ts
type AuthSession = {
  user: { id: string; email: string | null };
  signedIn: boolean;
};

type CurrentUser = {
  id: string;
  email: string | null;
  role: "customer" | "admin";
  fullName: string | null;
  phone: string | null;
  defaultAddress: string | null;
  privacyConsentAt: string | null;
  privacyPolicyVersion: string | null;
};
```

`signUp` checks `consent === true` and a non-empty `policyVersion` before it
calls the auth server and returns `CONSENT_REQUIRED` otherwise. The policy
version is passed in the user metadata for the profile trigger. Auth errors map
to `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `RATE_LIMITED`, `VALIDATION_ERROR`, or
`UNAUTHENTICATED`.

### Admin

```ts
adminListProducts(input: unknown): Promise<Result<AdminProductList>>;
adminGetProduct(input: unknown): Promise<Result<AdminProductDetail>>;
adminUpsertProduct(input: unknown): Promise<Result<AdminProductDetail>>;
adminSetProductActive(input: unknown): Promise<Result<AdminProductDetail>>;
adminAdjustStock(input: unknown): Promise<Result<AdminStockAdjustment>>;
adminUploadImage(input: unknown): Promise<Result<ProductImage>>;
adminDeleteImage(input: unknown): Promise<Result<AdminImageDeleteResult>>;
adminReorderImages(input: unknown): Promise<Result<ProductImage[]>>;
adminListOrders(input: unknown): Promise<Result<AdminOrderList>>;
adminGetOrder(input: unknown): Promise<Result<AdminOrderDetail>>;
adminTransitionOrder(input: unknown): Promise<Result<AdminOrderDetail>>;
adminDashboard(): Promise<Result<AdminDashboard>>;
```

Inputs:

- `AdminListProductsInput`: `{ q?, category?, productType?, isActive?,
stockState?: "all" | "in" | "low" | "out", page?, pageSize? }`.
- `AdminGetProductInput`: `{ id }`.
- `AdminUpsertProductInput`: `{ id?, sku?, name?, productType?, category?,
gender?, priceVnd?, description?, caption?, articleId?, collection?, color?,
colorFamily?, pattern?, material?, fabricDesc?, sleeve?, neckline?, fit?,
length?, closure?, lining?, features?, season?, brand?, isActive?,
translations?: { locale, description?, caption? }[] }`. A new product needs
  `sku`, `name`, `productType`, `category`, `gender`, and `priceVnd`.
- `AdminSetProductActiveInput`: `{ id, isActive }`.
- `AdminAdjustStockInput`: `{ variantId, delta?, stock?, reason }` with exactly
  one of `delta` or `stock`.
- `AdminUploadImageInput`: `{ productId, file: File, position? }`.
- `AdminDeleteImageInput`: `{ imageId }`.
- `AdminReorderImagesInput`: `{ productId, imageIds: string[] }`.
- `AdminListOrdersInput`: `{ status?, paymentStatus?, paymentMethod?, q?, page?,
pageSize? }`.
- `AdminGetOrderInput`: `{ id }`.
- `AdminTransitionOrderInput`: `{ orderId, action: "confirm" | "ship" |
"deliver" | "cancel" }`.

```ts
type AdminProductList = {
  items: AdminProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

type AdminProductListItem = {
  id: string;
  sku: string;
  name: string;
  category: string;
  gender: string;
  productType: string;
  priceVnd: number;
  isActive: boolean;
  totalStock: number;
  variantCount: number;
  updatedAt: string;
  image: ProductImage | null;
};

type AdminProductDetail = ProductDetail & {
  translations: { locale: Locale; description: string | null; caption: string | null }[];
};

type AdminStockAdjustment = {
  variantId: string;
  variantSku: string;
  productId: string;
  stock: number;
};

type AdminImageDeleteResult = {
  id: string;
  source: "release" | "upload";
  deleted: boolean;
  isVisible: boolean;
};

type AdminOrderSummary = OrderSummary & { customer: CustomerSummary | null };
type AdminOrderDetail = OrderDetail & { customer: CustomerSummary | null };

type CustomerSummary = {
  id: string;
  fullName: string | null;
  phone: string | null;
  defaultAddress: string | null;
};

type AdminOrderList = {
  items: AdminOrderSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

type AdminDashboard = {
  demoData: true;
  revenueVnd: number;
  orderCount: number;
  ordersByStatus: Record<OrderStatus, number>;
  ordersByPaymentStatus: Record<PaymentStatus, number>;
  topProducts: {
    productId: string | null;
    sku: string;
    name: string;
    quantity: number;
    revenueVnd: number;
  }[];
  lowStockVariants: {
    variantId: string;
    variantSku: string;
    productName: string;
    productSku: string;
    optionLabel: string;
    stock: number;
  }[];
  lowStockThreshold: number;
};
```

Every admin function checks the caller role first and returns `FORBIDDEN` for a
customer. `adminSetProductActive` hides a product without deleting it.
`adminDeleteImage` deletes an uploaded object and its row; a release image is
only hidden (`isVisible: false`). `adminDashboard` calls the `admin_dashboard`
database function, which checks the administrator role and computes every
metric with database aggregates, so the PostgREST 1000-row cap cannot truncate
the totals. Revenue counts orders that are `delivered` and `paid`, excludes
cancelled and refunded orders, and uses a low-stock threshold of 5. The UI
shows the demo-data label from `demoData`.

### Media URLs

```ts
const IMAGE_SIZES = [480, 960, 1600] as const;
type ImageSize = (typeof IMAGE_SIZES)[number];
type MediaImage = { source: "release" | "upload"; path: string };

imageUrl(image: MediaImage, size: ImageSize): string | null;
buildReleaseImageUrl(baseUrl: string, path: string, size: ImageSize): string;
buildUploadImageUrl(supabaseUrl: string, bucket: string, path: string): string;
```

Release images use `getMediaConfig().baseUrl`, the base path stored in
`product_images.path` (`studio/<SKU>/<NN>`), and the size suffix:
`<base>/studio/<SKU>/<NN>-<size>.webp`. The size suffixes match
`data/media/manifest-studio-v1.json`. Without media configuration the function
returns `null` so the UI can render a neutral placeholder. Upload images use
the public `product-uploads` Storage URL. `imageUrl` is server-only because it
reads the media configuration; pass the returned string to client components.

### Assistant provider

`src/server/ai/` calls OpenAI-compatible Chat Completions endpoints with
`fetch` and normalizes Mistral's response format itself; no SDK and no proxy
sit in between.

```ts
getAiStatus(): AiStatus; // { status: "ready", primaryModel, fallbackModel } | { status: "not_configured", reason }
createAiProvider(options?): ChatProvider | null; // primary with failover, one per turn

interface ChatProvider {
  readonly model: string;
  stream(request: { messages; tools?; signal? }): AsyncIterable<ProviderEvent>;
  complete(request: { messages; tools?; signal? }): Promise<ChatCompletion>;
}

type ProviderEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; arguments: string }
  | { type: "finish"; reason: "stop" | "length" | "tool_calls" | "content_filter" | "other"; usage };
```

- **Response.** A string `content` is kept. An array `content` is reduced to
  its `text` chunks; `thinking` chunks (string or `{ type: "text" }` parts) and
  `reasoning_content` are dropped in full responses and in every streamed
  `delta`. Reasoning is never streamed to the browser, shown, stored, or sent
  back. Streams are read from `data:` lines until `data: [DONE]`; tool call
  fragments are assembled by `index` and emitted whole, before `finish`.
- **Request.** Messages are mapped field by field, so only standard fields are
  sent. An assistant message that only carries tool calls omits `content`;
  tool results carry `tool_call_id` and `name`. `reasoning_effort` is sent only
  when the role configures it, because Mistral answers `422 extra_forbidden`
  to parameters a model does not accept. `max_tokens` leaves room for reasoning
  tokens, and every request sends `User-Agent: coveweft-swim/<version>`.
- **Errors.** `ProviderError.kind` is `timeout`, `rate_limit`, `server`,
  `auth`, `config`, or `bad_request`, with the HTTP `status` when there is one.
  `AI_TIMEOUT_MS` aborts a request that receives no data for that long. Error
  `detail` is for logs only.
- **Failover.** `withFailover(primary, fallback)` moves to the fallback at most
  once, on `timeout`, `rate_limit`, or `server`, and only before any text or
  tool call was emitted. Later requests of the same turn stay on the fallback,
  and the primary's tool calls and results are removed from the history first,
  because tool call ids differ between models. An error after output ends the
  stream with a retryable error instead of joining two answers; `auth`,
  `config`, and `bad_request` errors are not retried.

`pnpm ai:smoke` runs a plain chat, a two-round tool call with a stub
`searchProducts` tool, and a streamed answer against each configured role. It
prints the model, HTTP status, latency, and whether reasoning text from the
raw response reached the normalized output, never the key. A failure names the
role and its variables; the script does not switch models.

### Demo account provisioning

`pnpm provision:demo` runs `scripts/provision-demo.mjs`. It creates one
customer and one administrator through the Auth Admin API, includes
`privacy_policy_version` in the user metadata for the profile trigger, and
ensures the administrator role. Re-running keeps the existing passwords and
does not duplicate accounts. The local defaults live in `.env.example`
(`DEMO_CUSTOMER_*`, `DEMO_ADMIN_*`, `DEMO_POLICY_VERSION`); a cloud project
overrides them with its own environment values and never commits cloud
passwords.

## Order lifecycle

Order status moves `pending -> confirmed -> shipping -> delivered`; an allowed
cancellation moves it to `cancelled`. Payment status is independent: `unpaid`,
`paid`, or `refunded`.

| Action          | Actor    | Preconditions                                                   | Result                                                                                    |
| --------------- | -------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Place order     | Customer | Cart has lines; every variant is active and has enough stock    | `pending`, `unpaid`; stock deducted; cart cleared; `payment_due_at` set for bank transfer |
| Pay (simulated) | Customer | Bank transfer, `pending`, `unpaid`, before `payment_due_at`     | Success -> `paid`; failure records an attempt and leaves the order unchanged              |
| Expire          | Cron     | Bank transfer, `pending`, `unpaid`, past `payment_due_at`       | `cancelled`; stock restored                                                               |
| Cancel          | Customer | Own order, `pending`                                            | `cancelled`; stock restored; `paid` -> `refunded`                                         |
| Confirm         | Admin    | `pending`; a bank transfer must be `paid`; COD needs no payment | `confirmed`                                                                               |
| Ship            | Admin    | `confirmed`                                                     | `shipping`                                                                                |
| Deliver         | Admin    | `shipping`                                                      | `delivered`; COD -> `paid`                                                                |
| Cancel          | Admin    | `pending` or `confirmed`                                        | `cancelled`; stock restored; `paid` -> `refunded`                                         |

Every transition locks the order row (`FOR UPDATE`) and re-checks the current
state. Stock is restored only on the single transition to `cancelled`.

`place_order` materializes the caller cart exactly once, locking the rows it
reads. It then locks the variants and products in ascending id order and uses
that immutable snapshot for the availability check, subtotal, order items,
stock deduction, and cart cleanup. A cart row inserted after the snapshot is
not charged or deducted and stays in the cart. A repeated
`(user_id, idempotency_key)` returns the existing order without deducting stock
again.

Deadline checks read `clock_timestamp()` after the order row lock is acquired,
so a request that waited on the lock cannot pass an expired deadline. The
expiry job locks the whole eligible order batch first, collects the union of
its variants, and locks that union in one ascending-id pass before restocking.
This keeps expiry, cancellation, and checkout on the same lock order and avoids
the deadlock that per-order restocking could produce.

### Database functions

| Function                                                     | Caller              | Purpose                                                                |
| ------------------------------------------------------------ | ------------------- | ---------------------------------------------------------------------- |
| `place_order(idempotency_key, recipient, shipping, payment)` | authenticated       | Creates an idempotent order from the caller cart.                      |
| `cancel_order(order_id)`                                     | authenticated       | Cancels an owned pending order and restores stock.                     |
| `record_payment_attempt(order_id, outcome)`                  | authenticated       | Records a simulated bank transfer attempt.                             |
| `admin_transition_order(order_id, action)`                   | authenticated admin | Applies confirm, ship, deliver, or cancel.                             |
| `expire_unpaid_orders()`                                     | cron / service role | Cancels expired unpaid bank transfers.                                 |
| `admin_adjust_stock(variant_id, delta, stock, reason)`       | authenticated admin | Adjusts stock by delta or absolute value and writes an audit row.      |
| `add_cart_item(variant_id, quantity)`                        | authenticated       | Atomically accumulates the caller cart line, capped and stock-checked. |
| `admin_dashboard()`                                          | authenticated admin | Returns the dashboard aggregates in one JSON object.                   |

Functions raise stable message codes such as `OUT_OF_STOCK`, `CART_CHANGED`,
`ORDER_STATE_CONFLICT`, `PAYMENT_NOT_ALLOWED`, `PAYMENT_EXPIRED`, and
`CONSENT_REQUIRED`. `src/server/db/errors.ts` maps those codes, Postgres
privilege errors, and unique violations to the shared `ErrorCode` union.

`pg_cron` runs `expire_unpaid_orders()` every minute. The job is scheduled by
name, so replaying the migration updates the existing job instead of creating a
duplicate.

### Locale and messages

`src/lib/locale.ts` is the single source for `LOCALES`, `Locale`, and
`DEFAULT_LOCALE`. Routing uses `localePrefix: "always"`, so every page lives
under `/en` or `/vi`; `/` redirects to `/en` in `src/proxy.ts`. Locale
detection is disabled (`localeDetection: false`), so a request to `/` always
goes to `/en` even when `Accept-Language` prefers Vietnamese. The locale is
read from `next/root-params` in `src/i18n/request.ts`, which keeps pages
statically renderable. Services that return localized content accept a
`Locale` argument and fall back to English when a translation is missing.

## Configuration

`src/lib/config/env.ts` parses `process.env` with zod and caches the result.
It imports `server-only`, so importing it from a client component fails the
build. The app starts without optional AI or media values; those features
report that they are not configured instead of failing at boot.

| Variable                               | Scope         | Required       | Default                        |
| -------------------------------------- | ------------- | -------------- | ------------------------------ |
| `NEXT_PUBLIC_APP_URL`                  | Public        | No             | `http://localhost:3000`        |
| `NEXT_PUBLIC_SUPABASE_URL`             | Public        | Yes            | —                              |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public        | Yes            | —                              |
| `SUPABASE_URL_INTERNAL`                | Server        | Yes            | —                              |
| `SUPABASE_SECRET_KEY`                  | Server        | For admin work | —                              |
| `AI_PRIMARY_BASE_URL`                  | Server        | No             | `https://api.mistral.ai/v1`    |
| `AI_PRIMARY_MODEL`                     | Server        | No             | `deepseek-v4-1-flash-1017`     |
| `AI_PRIMARY_API_KEY`                   | Server        | No             | —                              |
| `AI_PRIMARY_REASONING_EFFORT`          | Server        | No             | `low`                          |
| `AI_FALLBACK_BASE_URL`                 | Server        | No             | `https://api.mistral.ai/v1`    |
| `AI_FALLBACK_MODEL`                    | Server        | No             | `mistral-small-2603`           |
| `AI_FALLBACK_API_KEY`                  | Server        | No             | —                              |
| `AI_FALLBACK_REASONING_EFFORT`         | Server        | No             | — (not sent)                   |
| `AI_TIMEOUT_MS`                        | Server        | No             | `30000`                        |
| `AI_MAX_TOKENS`                        | Server        | No             | `4096`                         |
| `AI_QUOTA_PER_USER_PER_DAY`            | Server        | No             | `30`                           |
| `AI_QUOTA_PER_USER_PER_MINUTE`         | Server        | No             | `5`                            |
| `AI_QUOTA_GLOBAL_PER_DAY`              | Server        | No             | `500`                          |
| `MEDIA_VERSION`                        | Server        | No             | —                              |
| `MEDIA_BASE_URL`                       | Server        | No             | —                              |
| `MEDIA_ARCHIVE_SHA256`                 | Server        | No             | —                              |
| `DEMO_CUSTOMER_EMAIL`                  | Provisioning  | No             | `customer@demo.coveweft.local` |
| `DEMO_CUSTOMER_PASSWORD`               | Provisioning  | No             | `demo-customer-123`            |
| `DEMO_CUSTOMER_NAME`                   | Provisioning  | No             | `Demo Customer`                |
| `DEMO_ADMIN_EMAIL`                     | Provisioning  | No             | `admin@demo.coveweft.local`    |
| `DEMO_ADMIN_PASSWORD`                  | Provisioning  | No             | `demo-admin-123`               |
| `DEMO_ADMIN_NAME`                      | Provisioning  | No             | `Demo Admin`                   |
| `DEMO_POLICY_VERSION`                  | Provisioning  | No             | `2026-11-06`                   |
| `GITHUB_TOKEN`                         | Server script | No             | —                              |

`.env.example` lists every variable with local defaults or an empty placeholder
for values that come from `supabase status`. Never commit `.env.local` or a
real key. `getAiConfig()` reads only the `AI_*` variables, so the assistant
provider and `pnpm ai:smoke` work without the Supabase settings. An empty
`AI_*_REASONING_EFFORT` means the parameter is not sent; models can be changed
through these variables without code changes. Shipping fees and the free-shipping threshold are not environment
variables; they live in the database `store_settings` row.

## Supabase clients

| Module                        | Key                                  | Where it runs                                     |
| ----------------------------- | ------------------------------------ | ------------------------------------------------- |
| `src/lib/supabase/server.ts`  | Publishable key plus request cookies | Server components, server actions, route handlers |
| `src/lib/supabase/browser.ts` | Publishable key                      | Client components                                 |
| `src/lib/supabase/admin.ts`   | Secret key                           | Server-only jobs and provisioning scripts         |

The server and admin clients use `SUPABASE_URL_INTERNAL`; the browser client
uses `NEXT_PUBLIC_SUPABASE_URL`. When the app runs in a container on the
Supabase Docker network, the internal URL points at the network service (for
example `http://kong:8000`) while the browser keeps using `localhost`.

Because the two URLs have different hostnames, all clients set the same
explicit auth cookie name from `src/lib/supabase/cookie.ts`
(`sb-coveweft-auth-token`). This keeps one session across the browser and the
server. `src/proxy.ts` refreshes the session with `getClaims()` before the
locale middleware builds its response, writes refreshed cookies back to the
request, and attaches the refreshed cookies and cache headers to the final
response.

The admin client bypasses RLS. It imports `server-only`, so a client component
that imports it fails the build. Scripts that run outside the Next.js bundler
must not import it; they should read the secret from the environment and build
their own client, or run with the `react-server` condition.

## Data ownership by environment

- **Local** uses the Docker stack defined by `supabase/config.toml`
  (`project_id = "coveweft-swim"`). Migrations in `supabase/migrations` and
  seed data in `supabase/seed.sql` are the source of truth. Seed scripts are
  idempotent and never duplicate rows. The catalog snapshot in `data/catalog/`
  is generated by `pnpm catalog:export`; `supabase/seed.sql` is generated from
  the same snapshot, and `pnpm db:seed` loads it through the service role into
  an existing database without overwriting stock or administrator edits.
- **Cloud** uses a separate Supabase project. It is provisioned from the same
  migrations and seed files; local data is never copied to cloud and cloud
  credentials are never used locally.
- **Media** comes from a versioned archive with a SHA-256 manifest. The local
  app serves the extracted archive; cloud uses Supabase Storage with the same
  object keys. Admin uploads live in Storage and are separate from the archive.
  Committed media metadata lives in `data/media/` (manifest and build report).
  `/.media-build/` holds build output and `/.media-cache/` holds the runtime
  extraction cache; both are ignored by git. The pipeline commands and the
  manifest contract are documented in [`media.md`](media.md).
- **Configuration** differs per environment but names stay the same. Local
  values live in `.env.local`; cloud values live in the hosting provider's
  environment settings.

## Testing

- **Unit tests** (`tests/unit`) cover pure modules: contracts, money
  formatting, environment parsing, the shared Supabase cookie name, the
  database error mapper, the proxy refresh helper when Supabase is not
  configured, and the assistant provider (content normalization, request
  fields, SSE parsing, error classification, and failover against mocked
  responses). They run in CI with `pnpm test` and need no Docker.
- **Integration tests** (`tests/integration`) call Postgres functions and RLS
  policies against a local Supabase stack. They cover consent, RLS isolation,
  order placement, idempotency, concurrent last-item checkout, payment and
  expiry races, administrator transitions, and stock adjustments. The service
  suites add catalog search, facets, size guides, and locale fallback; cart
  issues and concurrent accumulation; checkout quotes and idempotent placement;
  order history, cancellation, and simulated payments; sign-up consent and
  profile updates; admin product, image, order, and dashboard flows; hidden
  image visibility; dashboard aggregates beyond the PostgREST row cap; media
  URLs; validation issue codes; and demo account provisioning. Concurrency
  regressions use a direct Postgres scheduling connection to hold a table or
  row lock at a precise point; that seam is not reachable by API clients. Run
  them with `pnpm test:integration` after `supabase start`; the runner resolves
  the local URL and keys from `.env.local` or from `supabase status`.
- **End-to-end tests** (`tests/e2e`) drive the rendered app with Playwright.
  They start the development server automatically unless
  `PLAYWRIGHT_BASE_URL` points at a running instance.

`.github/workflows/ci.yml` runs lint, typecheck, and unit tests on every push
to `main` and every pull request. Database integration tests are intentionally
not part of that job: they need Docker and a Supabase stack, so they run on a
developer machine (or a dedicated database job) before a migration is merged.

## Deployment

`next.config.ts` sets `output: "standalone"`, so the production image runs the
generated server bundle. Vercel builds the same app from the repository; the
only difference is the environment values. Auth redirect URLs must match the
public app URL of each environment.
