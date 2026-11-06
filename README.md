# COVEWEFT Swim

_Find your water._

COVEWEFT Swim is a demo B2C swimwear store built for the CO3027 Electronic Commerce course at Ho Chi Minh City University of Technology (HCMUT), semester 261. It is a study project: the store does not sell products, take payments, or ship orders.

## Status

The project is in early development. The application scaffold, architecture notes, and development setup are in place; catalog data and attribution will be added as each part lands.

## Planned stack

- Next.js with TypeScript, React, and Tailwind CSS
- Supabase for Postgres, authentication, and storage
- Vercel for hosting

## Run the demo locally

The demo runs on Docker alone. The app image, the local Supabase stack, the
catalog seed, and the studio media all come from this repository plus one
release archive, so the host does not need Node.js or pnpm.

### Requirements

- Docker Desktop on macOS or Windows, or Docker Engine on Linux, with at least
  4 GB of memory available to Docker
- The Supabase CLI
- macOS or Linux with `curl`, `tar`, and `shasum` or `sha256sum` (all
  preinstalled)
- Windows 10 (1803) or later, which ships `tar.exe` and `curl.exe`

Install the Supabase CLI:

```sh
# macOS and Linux
brew install supabase/tap/supabase
```

```powershell
# Windows, with Scoop
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### Start the demo

macOS and Linux:

```sh
./scripts/demo.sh
```

Windows (Windows PowerShell 5.1 or PowerShell 7). `-ExecutionPolicy Bypass`
applies to this process only, so the machine policy is unchanged:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo.ps1
```

With PowerShell 7, use `pwsh` in place of `powershell` if you prefer. The first
run downloads the Supabase images and the media archive and builds the app
image, so it can take several minutes. Later runs reuse the images, the
database volumes, and the media cache and finish in under a minute.

The script runs these steps:

1. Checks that Docker is running and that the Supabase CLI, `curl`, `tar`, and a
   SHA-256 tool are available, and prints the install hint when one is missing.
2. Runs `supabase start` and leaves an already running stack alone.
3. Creates `.env.local` from `.env.example` and fills in the local Supabase URL
   and keys. Later runs refresh only those values, so AI keys and other edits
   are kept.
4. Applies pending migrations.
5. Loads `supabase/seed.sql`. The seed only inserts missing rows, so orders,
   stock changes, and admin edits survive a rerun.
6. Downloads `coveweft-media-studio-v1.tar.gz` from the GitHub release,
   verifies it against `MEDIA_ARCHIVE_SHA256`, and extracts it into
   `.media-cache/studio-v1/`. A verified version is not downloaded again, and an
   interrupted download resumes.
7. Creates the demo customer and administrator inside the app image, so the host
   does not need Node.js.
8. Builds the app image and starts the container on the Supabase Docker network,
   where the server reaches Supabase through `SUPABASE_URL_INTERNAL`.
9. Prints the URLs and the demo accounts.

When it finishes:

| What                  | URL                                               |
| --------------------- | ------------------------------------------------- |
| Store                 | <http://localhost:3000/en> (`/vi` for Vietnamese) |
| Admin                 | <http://localhost:3000/en/admin>                  |
| Supabase Studio       | <http://127.0.0.1:54323>                          |
| Mailpit (local email) | <http://127.0.0.1:54324>                          |

Demo accounts, local only:

- Customer: `customer@demo.coveweft.local` / `demo-customer-123`
- Administrator: `admin@demo.coveweft.local` / `demo-admin-123`

The container mounts the extracted media at `/app/public/media` and serves it
at `/media`; admin uploads go to the local Supabase Storage bucket. Stop the
demo with `docker stop coveweft-swim-app` and `supabase stop`; the database and
the media cache are kept.

### The same steps by hand

The scripts wrap the commands below. Run them from the repository root after
starting Docker and the Supabase CLI.

```sh
supabase start
cp .env.example .env.local
supabase status -o env   # copy API_URL, PUBLISHABLE_KEY, and SECRET_KEY
# then set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and
# SUPABASE_SECRET_KEY in .env.local

supabase migration up
docker cp supabase/seed.sql supabase_db_coveweft-swim:/tmp/coveweft-seed.sql
docker exec supabase_db_coveweft-swim psql -U postgres -d postgres \
  -f /tmp/coveweft-seed.sql

mkdir -p .media-cache/studio-v1
curl -fL -o .media-cache/coveweft-media-studio-v1.tar.gz \
  https://github.com/KoangWy/coveweft-swim/releases/download/media-studio-v1/coveweft-media-studio-v1.tar.gz
shasum -a 256 .media-cache/coveweft-media-studio-v1.tar.gz   # sha256sum on Linux
# compare the digest with MEDIA_ARCHIVE_SHA256 in .env.local, then
tar -xzf .media-cache/coveweft-media-studio-v1.tar.gz -C .media-cache/studio-v1
printf '%s' <digest> > .media-cache/studio-v1/.verified

docker build -t coveweft-swim-app:local \
  --build-arg NEXT_PUBLIC_APP_URL=http://localhost:3000 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key> .

docker run --rm --network supabase_network_coveweft-swim \
  --env-file .env.local \
  -e SUPABASE_URL_INTERNAL=http://supabase_kong_coveweft-swim:8000 \
  coveweft-swim-app:local node scripts/provision-demo.mjs

docker run -d --name coveweft-swim-app \
  --network supabase_network_coveweft-swim \
  --env-file .env.local \
  -e SUPABASE_URL_INTERNAL=http://supabase_kong_coveweft-swim:8000 \
  -e NEXT_PUBLIC_APP_URL=http://localhost:3000 \
  -e MEDIA_BASE_URL=http://localhost:3000/media \
  -p 3000:3000 \
  -v "$PWD/.media-cache/studio-v1:/app/public/media:ro" \
  coveweft-swim-app:local
```

On Windows, use `tar.exe` and `Get-FileHash -Algorithm SHA256` instead of
`tar` and `shasum`, and replace `$PWD` with the repository path. The scripts
create a temporary env file with the same overrides, so `.env.local` stays a
normal environment file for `pnpm dev`.

### Reset the database

Reset deletes local orders, carts, accounts, and admin edits and rebuilds the
database from the migrations and seed. The media cache and `.env.local` are
kept.

```sh
./scripts/reset.sh          # asks you to type "reset"
./scripts/reset.sh --yes    # no question
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\reset.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\reset.ps1 -Yes
```

### Add an AI key

Put the key in `.env.local` (see `.env.example` for the provider settings):

```sh
AI_PRIMARY_API_KEY=your-key
AI_FALLBACK_API_KEY=your-fallback-key   # optional
```

Then run the demo script again. It recreates the app container from the current
`.env.local` in under a minute; restarting the old container is not enough
because Docker reads `--env-file` only when it creates the container. Without a
key the store works and the assistant reports that it is not configured.

### Use another port

The default port is 3000. Set `APP_PORT` when something else already uses it:

```sh
APP_PORT=3100 ./scripts/demo.sh
```

```powershell
$env:APP_PORT = "3100"; .\scripts\demo.ps1
```

The script updates the app URL and the media base URL in the container
environment, so `/media` keeps working on the new port.

### Troubleshooting

- **Port already in use.** Find the listener with
  `lsof -nP -iTCP:3000 -sTCP:LISTEN` on macOS or Linux, or
  `Get-NetTCPConnection -LocalPort 3000 -State Listen` in PowerShell, then stop
  it or pick another `APP_PORT` as shown above.
- **Docker is not running.** Start Docker Desktop, `colima start`, or
  `sudo systemctl start docker`, then run the script again. On Linux,
  `permission denied` while connecting to the daemon means your user is not in
  the `docker` group: `sudo usermod -aG docker "$USER"`, then log out and back in.
- **The media download fails.** The release is public. If the repository is
  private again, set `GITHUB_TOKEN` to a token with read access
  (`$env:GITHUB_TOKEN = "<token>"` in PowerShell) and rerun, or download the
  asset from the releases page and pass it with `MEDIA_ARCHIVE_PATH`.
- **The first run is slow.** The Supabase images and the media archive are large
  downloads; the build also installs dependencies once. Later runs reuse all of
  them. An interrupted media download resumes on the next run.
- **`supabase start` fails.** Ports 54321-54324 must be free, and Docker needs
  at least 4 GB of memory. `supabase stop` first if the stack is half started;
  the database volume is kept.

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

### Chạy thử cục bộ

Bản demo chỉ cần Docker. Ứng dụng, Supabase local, dữ liệu catalog và ảnh studio đều lấy từ kho mã nguồn và một gói release, nên máy chủ không cần Node.js hay pnpm.

**Yêu cầu**

- Docker Desktop trên macOS hoặc Windows, hoặc Docker Engine trên Linux, cấp ít nhất 4 GB bộ nhớ cho Docker.
- Supabase CLI.
- macOS hoặc Linux có `curl`, `tar` và `shasum` hay `sha256sum` (đều có sẵn).
- Windows 10 (1803) trở lên, đã có `tar.exe` và `curl.exe`.

Cài Supabase CLI:

```sh
brew install supabase/tap/supabase            # macOS và Linux
```

```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase                        # Windows
```

**Khởi động**

macOS và Linux:

```sh
./scripts/demo.sh
```

Windows (Windows PowerShell 5.1 hoặc PowerShell 7). `-ExecutionPolicy Bypass` chỉ áp dụng cho tiến trình này, không đổi chính sách của máy:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo.ps1
```

Lần chạy đầu tải image Supabase và gói media rồi build image ứng dụng nên mất vài phút. Các lần sau dùng lại image, volume và cache media nên xong trong chưa đến một phút.

Script thực hiện: kiểm tra Docker và Supabase CLI; `supabase start`; tạo `.env.local` từ `.env.example` và điền URL, key local (giữ nguyên key AI bạn đã nhập); áp migration còn thiếu; nạp seed catalog (chỉ thêm dòng còn thiếu); tải `coveweft-media-studio-v1.tar.gz` từ GitHub Release, kiểm SHA-256 rồi giải nén vào `.media-cache/studio-v1/`; tạo tài khoản demo ngay trong image ứng dụng, không cần Node.js trên máy; build và chạy container trên network Docker của Supabase; in URL và tài khoản demo.

Khi chạy xong:

| Mục                   | URL                                               |
| --------------------- | ------------------------------------------------- |
| Cửa hàng              | <http://localhost:3000/en> (`/vi` cho tiếng Việt) |
| Quản trị              | <http://localhost:3000/en/admin>                  |
| Supabase Studio       | <http://127.0.0.1:54323>                          |
| Mailpit (email local) | <http://127.0.0.1:54324>                          |

Tài khoản demo (chỉ dùng local): khách `customer@demo.coveweft.local` / `demo-customer-123`; quản trị `admin@demo.coveweft.local` / `demo-admin-123`.

Dừng demo bằng `docker stop coveweft-swim-app` và `supabase stop`; dữ liệu và cache media được giữ lại.

**Các bước thủ công tương đương**

Script chỉ gói lại các lệnh sau; chạy từ thư mục gốc của kho:

```sh
supabase start
cp .env.example .env.local
supabase status -o env   # sao API_URL, PUBLISHABLE_KEY, SECRET_KEY vào .env.local
supabase migration up
docker cp supabase/seed.sql supabase_db_coveweft-swim:/tmp/coveweft-seed.sql
docker exec supabase_db_coveweft-swim psql -U postgres -d postgres \
  -f /tmp/coveweft-seed.sql
mkdir -p .media-cache/studio-v1
curl -fL -o .media-cache/coveweft-media-studio-v1.tar.gz \
  https://github.com/KoangWy/coveweft-swim/releases/download/media-studio-v1/coveweft-media-studio-v1.tar.gz
shasum -a 256 .media-cache/coveweft-media-studio-v1.tar.gz   # sha256sum trên Linux
tar -xzf .media-cache/coveweft-media-studio-v1.tar.gz -C .media-cache/studio-v1
printf '%s' <mã-băm> > .media-cache/studio-v1/.verified
```

Sau đó build image và chạy container như mục "The same steps by hand" ở phần tiếng Anh, hoặc đọc trực tiếp `scripts/demo.sh`. Trên Windows, dùng `tar.exe` và `Get-FileHash -Algorithm SHA256` thay cho `tar` và `shasum`.

**Reset database**

```sh
./scripts/reset.sh        # hỏi xác nhận, gõ "reset"
./scripts/reset.sh --yes  # không hỏi
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\reset.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\reset.ps1 -Yes
```

Reset xóa đơn hàng, giỏ hàng, tài khoản và chỉnh sửa của quản trị, rồi dựng lại database từ migration và seed. Cache media và `.env.local` được giữ.

**Thêm API key AI**

Điền `AI_PRIMARY_API_KEY` (và `AI_FALLBACK_API_KEY` nếu có) trong `.env.local`, rồi chạy lại script demo để tạo lại container; Docker chỉ đọc `--env-file` khi tạo container nên khởi động lại container cũ không đủ. Không có key thì cửa hàng vẫn chạy và trợ lý báo chưa cấu hình.

**Đổi cổng**

Dùng `APP_PORT=3100 ./scripts/demo.sh`, hoặc trong PowerShell `$env:APP_PORT = "3100"; .\scripts\demo.ps1`. Script tự cập nhật URL ứng dụng và `MEDIA_BASE_URL`.

**Lỗi thường gặp**

- Cổng đã bị chiếm: tìm tiến trình bằng `lsof -nP -iTCP:3000 -sTCP:LISTEN` (macOS, Linux) hoặc `Get-NetTCPConnection -LocalPort 3000 -State Listen` (Windows), rồi đổi `APP_PORT`.
- Docker chưa chạy: mở Docker Desktop, chạy `colima start`, hoặc `sudo systemctl start docker`. Trên Linux, lỗi `permission denied` nghĩa là người dùng chưa thuộc nhóm `docker`: chạy `sudo usermod -aG docker "$USER"` rồi đăng xuất và đăng nhập lại.
- Tải media thất bại: release đang công khai; nếu kho chuyển sang riêng tư, đặt `GITHUB_TOKEN` có quyền đọc rồi chạy lại, hoặc tải file thủ công và truyền qua `MEDIA_ARCHIVE_PATH`.
- Lần đầu chậm: image Supabase và gói media khá lớn, build cũng cài dependency một lần; các lần sau dùng lại. Bản tải dở sẽ tiếp tục ở lần chạy sau.
- `supabase start` lỗi: cần trống cổng 54321-54324 và Docker có ít nhất 4 GB bộ nhớ; chạy `supabase stop` nếu stack đang dở dang, volume dữ liệu vẫn được giữ.

</details>
