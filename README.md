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
| `pnpm format`           | Format the repository with Prettier                                              |

### Local Supabase

`supabase/config.toml` defines the local stack (`project_id = "coveweft-swim"`).
Migrations live in `supabase/migrations` and seed data in `supabase/seed.sql`.
`pnpm dlx supabase stop` shuts the stack down without deleting data, and
`pnpm dlx supabase db reset` recreates it from the migrations and seed.

The migrations create the catalog, profile, cart, order, payment, and stock
tables; enable row level security; install the order and stock functions; and
schedule the unpaid-order expiry job with `pg_cron`. `store_settings` is seeded
with the local shipping fees, free-shipping threshold, and payment window.

Run `pnpm test:integration` after `supabase start` to exercise the policies and
functions. The runner reads the local URL and keys from `.env.local` or from
`supabase status`, so the keys copied during setup are enough.

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
