# COVEWEFT Swim

_Find your water._

COVEWEFT Swim is a demo B2C swimwear store built for the CO3027 Electronic Commerce course at Ho Chi Minh City University of Technology (HCMUT), semester 261. It is a study project: the store does not sell products, take payments, or ship orders.

## Status

The project is in early development. The application scaffold, architecture notes, and development setup are in place; catalog data and attribution will be added as each part lands.

## Planned stack

- Next.js with TypeScript, React, and Tailwind CSS
- Supabase for Postgres, authentication, and storage
- Vercel for hosting

## Development

### Requirements

- Node.js 26 LTS (see `.nvmrc`)
- pnpm 12
- A Docker-compatible runtime and the Supabase CLI for the local database

### Setup

```sh
pnpm install
cp .env.example .env.local
pnpm dlx supabase start
pnpm dlx supabase status   # copy the publishable and secret keys into .env.local
pnpm dev
```

Open <http://localhost:3000>. The root path redirects to `/en`; `/vi` renders the
Vietnamese site. If the Supabase CLI is installed globally, drop `pnpm dlx` from
the commands above.

### Scripts

| Command                 | What it does                                                                     |
| ----------------------- | -------------------------------------------------------------------------------- |
| `pnpm dev`              | Start the development server                                                     |
| `pnpm build`            | Create a production build (`output: "standalone"`)                               |
| `pnpm start`            | Serve the production build                                                       |
| `pnpm lint`             | Run ESLint                                                                       |
| `pnpm typecheck`        | Generate route types and run `tsc --noEmit`                                      |
| `pnpm test`             | Run unit tests                                                                   |
| `pnpm test:integration` | Run database integration tests against local Supabase (needs Docker)             |
| `pnpm test:e2e`         | Run Playwright tests (install browsers once with `pnpm exec playwright install`) |
| `pnpm catalog:export`   | Rebuild `data/catalog/` and `supabase/seed.sql` from the SOBIE source package    |
| `pnpm db:seed`          | Load the catalog into a running database without overwriting existing rows       |
| `pnpm media:build`      | Download studio photos and build the versioned WebP media set                    |
| `pnpm media:verify`     | Re-check the media manifest, exported files, and archive                         |
| `pnpm provision:demo`   | Create the demo customer and administrator accounts through the Auth Admin API   |
| `pnpm ai:smoke`         | Call the configured AI provider roles with live requests and report the results  |
| `pnpm format`           | Format the repository with Prettier                                              |

### Catalog import

The catalog snapshot comes from the SOBIE Drive package, which stays outside
this repository. Pass both CSV paths as arguments:

```sh
pnpm catalog:export \
  --source /path/to/products.csv \
  --inventory /path/to/sobie-drive-inventory.csv
```

The command validates the snapshot (475 products, 1,541 variants, 3,224 studio
images, full Vietnamese translation coverage, and a size guide key for every
garment variant), then writes `data/catalog/products.json`, `variants.json`,
`images.json`, `import-report.json`, and `SOURCE.md`. It also regenerates
`supabase/seed.sql`. The export is deterministic: running it again against the
same inputs produces the same files.

`SOURCE.md` records provenance, the columns used, and the normalization rules.
`import-report.json` lists source anomalies without changing the raw data, such
as duplicate product names, zero-stock variants, and the `S (Y)` label on
`BB25HBX`.

The seed is idempotent. `supabase db reset` reloads everything from the
migrations and `supabase/seed.sql`; `pnpm db:seed` inserts only missing rows in
an existing database. Both paths keep current stock and administrator edits, so
use `db reset` when a full reload is intended. The initial variant stock is
written directly by the seed because the client `INSERT` grant on
`product_variants` excludes `stock`; later stock changes go through
`admin_adjust_stock` and are audited.

### Media

Studio images are not committed. The media pipeline reads an inventory CSV as
an argument, downloads the studio originals from the shared SOBIE Drive folder,
and exports fixed WebP sizes with a SHA-256 manifest:

```sh
pnpm media:build --inventory /path/to/sobie-drive-inventory.csv
pnpm media:verify
```

`data/media/` holds the committed manifest and build report; `.media-build/`
holds the generated WebP files and the release archive and is ignored by Git.
Position numbering matches the catalog export (`studio/<SKU>/<NN>-<size>.webp`).
See [`docs/media.md`](docs/media.md) for options, resume behavior, and release
steps.

### Local Supabase

`supabase/config.toml` defines the local stack (`project_id = "coveweft-swim"`).
Migrations live in `supabase/migrations` and seed data in `supabase/seed.sql`.
`pnpm dlx supabase stop` shuts the stack down without deleting data, and
`pnpm dlx supabase db reset` recreates it from the migrations and seed.

The migrations create the catalog, profile, cart, order, payment, and stock
tables; enable row level security; install the order and stock functions; and
schedule the unpaid-order expiry job with `pg_cron`. `store_settings` is seeded
with the local shipping fees, free-shipping threshold, and payment window. The
catalog seed loads products, variants, studio images, Vietnamese translations,
and attribute labels from the committed `data/catalog/` snapshot.

Run `pnpm test:integration` after `supabase start` to exercise the policies and
functions. The runner reads the local URL and keys from `.env.local` or from
`supabase status`, so the keys copied during setup are enough.

`pnpm provision:demo` creates one customer account and one administrator
account through the Auth Admin API. It reads `DEMO_CUSTOMER_*` and `DEMO_ADMIN_*`
from `.env.local` (see `.env.example` for the local defaults). Running it again
keeps the existing passwords and does not duplicate accounts. Use the same
command against a cloud project with that project's environment values; do not
commit cloud passwords.

### Shopping Assistant provider

The assistant calls Mistral through its OpenAI-compatible Chat Completions
API. Put the API key in `.env.local` as `AI_PRIMARY_API_KEY` and
`AI_FALLBACK_API_KEY`; without a key the app still starts and the assistant
reports that it is not configured. The default models are
`deepseek-v4-1-flash-1017` (primary, `reasoning_effort` `low`) and
`mistral-small-2603` (fallback, no `reasoning_effort`); change them with the
`AI_*` variables in `.env.example`. `pnpm ai:smoke` checks a plain chat, a
two-round tool call, and streaming against both roles; it needs only the
`AI_*` variables and a funded Mistral account.

### Continuous integration

`.github/workflows/ci.yml` runs lint, typecheck, and unit tests on every push to
`main` and every pull request. Database integration tests are not part of that
job because they need Docker and a running Supabase stack; run
`pnpm test:integration` locally before merging a migration. The unit suite stays
Docker-free.

See [`docs/architecture.md`](docs/architecture.md) for module boundaries, shared
contracts, and environment configuration.

<details>
<summary>Tiếng Việt</summary>

COVEWEFT Swim là cửa hàng đồ bơi B2C demo, xây dựng cho môn CO3027 Thương mại điện tử tại Trường Đại học Bách khoa TP.HCM (HCMUT), học kỳ 261. Đây là dự án học tập: cửa hàng không bán hàng, không thu tiền và không giao hàng thật.

Dự án đang ở giai đoạn đầu. Khung ứng dụng, tài liệu kiến trúc và hướng dẫn cài đặt đã có; dữ liệu catalog và ghi nguồn sẽ được bổ sung theo từng phần.

Công nghệ dự kiến: Next.js (TypeScript, React, Tailwind CSS), Supabase (Postgres, xác thực, lưu trữ) và Vercel.

</details>
