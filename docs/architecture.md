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
| `FORBIDDEN`             | The signed-in user lacks the required role or ownership           |
| `NOT_FOUND`             | The requested record does not exist or is not visible             |
| `CONFLICT`              | The action conflicts with the current state or an idempotency key |
| `OUT_OF_STOCK`          | A variant does not have enough stock for the request              |
| `CART_CHANGED`          | Cart lines changed while the customer was checking out            |
| `ORDER_NOT_CANCELLABLE` | The order state does not allow cancellation                       |
| `PAYMENT_FAILED`        | A simulated payment attempt failed                                |
| `PAYMENT_EXPIRED`       | The payment window for the order has passed                       |
| `QUOTA_EXCEEDED`        | A per-user or global usage limit was reached                      |
| `AI_NOT_CONFIGURED`     | No AI provider key is configured for this environment             |
| `AI_UNAVAILABLE`        | Both the primary and fallback AI providers failed                 |
| `INTERNAL`              | An unexpected server error                                        |

The frontend maps each code to `errors.<CODE>` in `src/messages/en.json` and
`src/messages/vi.json`. Services and route handlers must not return translated
sentences.

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

| Variable                               | Scope         | Required       | Default                     |
| -------------------------------------- | ------------- | -------------- | --------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | Public        | No             | `http://localhost:3000`     |
| `NEXT_PUBLIC_SUPABASE_URL`             | Public        | Yes            | —                           |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public        | Yes            | —                           |
| `SUPABASE_URL_INTERNAL`                | Server        | Yes            | —                           |
| `SUPABASE_SECRET_KEY`                  | Server        | For admin work | —                           |
| `AI_PRIMARY_BASE_URL`                  | Server        | No             | `https://api.mistral.ai/v1` |
| `AI_PRIMARY_MODEL`                     | Server        | No             | `deepseek-v4-1-flash-1017`  |
| `AI_PRIMARY_API_KEY`                   | Server        | No             | —                           |
| `AI_FALLBACK_BASE_URL`                 | Server        | No             | `https://api.mistral.ai/v1` |
| `AI_FALLBACK_MODEL`                    | Server        | No             | `mistral-small-2603`        |
| `AI_FALLBACK_API_KEY`                  | Server        | No             | —                           |
| `AI_QUOTA_PER_USER_PER_DAY`            | Server        | No             | `30`                        |
| `AI_QUOTA_PER_USER_PER_MINUTE`         | Server        | No             | `5`                         |
| `AI_QUOTA_GLOBAL_PER_DAY`              | Server        | No             | `500`                       |
| `MEDIA_VERSION`                        | Server        | No             | —                           |
| `MEDIA_BASE_URL`                       | Server        | No             | —                           |
| `MEDIA_ARCHIVE_SHA256`                 | Server        | No             | —                           |
| `GITHUB_TOKEN`                         | Server script | No             | —                           |

`.env.example` lists every variable with local defaults or an empty placeholder
for values that come from `supabase status`. Never commit `.env.local` or a
real key. Shipping fees and the free-shipping threshold are not environment
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
  idempotent and never duplicate rows.
- **Cloud** uses a separate Supabase project. It is provisioned from the same
  migrations and seed files; local data is never copied to cloud and cloud
  credentials are never used locally.
- **Media** comes from a versioned archive with a SHA-256 manifest. The local
  app serves the extracted archive; cloud uses Supabase Storage with the same
  object keys. Admin uploads live in Storage and are separate from the archive.
  Committed media metadata lives in `data/media/` (manifest and build report).
  `/.media-build/` holds build output and `/.media-cache/` holds the runtime
  extraction cache; both are ignored by git.
- **Configuration** differs per environment but names stay the same. Local
  values live in `.env.local`; cloud values live in the hosting provider's
  environment settings.

## Testing

- **Unit tests** (`tests/unit`) cover pure modules: contracts, money
  formatting, environment parsing, the shared Supabase cookie name, and the
  proxy refresh helper when Supabase is not configured. They run in CI with
  `pnpm test`.
- **Integration tests** (`tests/integration`) call Postgres functions and RLS
  policies against a local Supabase stack. They are not part of the CI quality
  job because they need Docker; run them with `pnpm test:integration`.
- **End-to-end tests** (`tests/e2e`) drive the rendered app with Playwright.
  They start the development server automatically unless
  `PLAYWRIGHT_BASE_URL` points at a running instance.

`.github/workflows/ci.yml` runs lint, typecheck, and unit tests on every push
to `main` and every pull request.

## Deployment

`next.config.ts` sets `output: "standalone"`, so the production image runs the
generated server bundle. Vercel builds the same app from the repository; the
only difference is the environment values. Auth redirect URLs must match the
public app URL of each environment.
