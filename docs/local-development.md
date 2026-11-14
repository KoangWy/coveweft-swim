# Local development

For the shortest path to a working store, follow [Run locally](../README.md#run-locally).
The demo scripts prepare the app, Supabase, catalog, media, environment, and demo
accounts. Run all commands below from the repository root.

## Install prerequisites

Start Docker and allow at least 4 GB of memory. Install the Supabase CLI as a
global command, since the demo scripts call `supabase` directly:

| System                      | Install the Supabase CLI                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| macOS / Linux with Homebrew | `brew install supabase/tap/supabase`                                                                    |
| Windows with Scoop          | `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git`, then `scoop install supabase` |
| Linux without Homebrew      | Install the appropriate package from the [CLI releases](https://github.com/supabase/cli/releases)       |

macOS/Linux also need `curl`, `tar`, and `shasum` or `sha256sum`. Windows needs
Windows 10 version 1803 or later with `tar.exe`; the script uses `curl.exe` when
available and falls back to PowerShell downloads.

Official installation reference: [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
(accessed 2026-11-11). The repository already includes `supabase/config.toml`;
there is no need to run `supabase init`, log in, or link a cloud project.

## Hot reload

Use Node.js 26 and pnpm 12.6.0, pinned in [`.nvmrc`](../.nvmrc) and
[`package.json`](../package.json).

1. Run the [demo command](../README.md#run-locally) once to prepare all local resources.
2. Stop only the app container; keep Supabase running:

   ```sh
   docker stop coveweft-swim-app
   pnpm install --frozen-lockfile
   ```

3. Make the downloaded photos available to the development server. Run this
   once, while `public/media` does not already exist:

   **macOS / Linux**

   ```sh
   ln -s ../.media-cache/studio-v1 public/media
   ```

   **Windows · PowerShell**

   ```powershell
   New-Item -ItemType Junction -Path public\media -Target (Resolve-Path .media-cache\studio-v1).Path
   ```

4. Keep the generated `.env.local`. With the default port, it should use:

   ```dotenv
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_URL_INTERNAL=http://127.0.0.1:54321
   MEDIA_BASE_URL=http://localhost:3000/media
   ```

   The demo script already fills in the Supabase keys. The internal Docker
   hostname is only for the container; the development server uses the host URL.

5. Start hot reload:

   ```sh
   pnpm dev
   ```

Open <http://localhost:3000/en> or <http://localhost:3000/vi>. Stop the development
server with Ctrl+C. Run `supabase stop` when finished with the database.
To return to the container demo, stop `pnpm dev` and rerun the demo script.

### Checks and utilities

```sh
pnpm lint
pnpm typecheck
pnpm test
```

CI runs these three checks. For database or browser changes, also run the
appropriate suite against a prepared local Supabase stack:

```sh
pnpm test:integration
pnpm exec playwright install
pnpm test:e2e
```

| Command                                                                   | Purpose                                                           |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm db:seed`                                                            | Insert missing catalog rows; preserve stock and admin edits       |
| `pnpm provision:demo`                                                     | Create missing demo accounts; preserve existing passwords         |
| `pnpm catalog:export --source <products.csv> --inventory <inventory.csv>` | Regenerate the catalog and SQL seed from source CSVs              |
| `pnpm media:build --inventory <inventory.csv>`                            | Build the studio media archive; see [Media pipeline](media.md)    |
| `pnpm media:verify`                                                       | Verify media build output, manifest, and archive                  |
| `pnpm ai:smoke`                                                           | Call configured providers with live requests; requires API credit |
| `pnpm format:check`                                                       | Check formatting                                                  |

`supabase db reset` deletes local data and reapplies migrations and seed; run
`pnpm provision:demo` afterward to restore demo logins. For the container demo,
the [reset scripts](../README.md#stop-or-reset) perform both steps.

## Demo options

### Another app port

**macOS / Linux**

```sh
APP_PORT=3100 ./scripts/demo.sh
```

**Windows · PowerShell**

```powershell
$env:APP_PORT = "3100"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo.ps1
```

Open <http://localhost:3100/en>. The scripts set the container's app and media
URLs for that port. Supabase keeps its configured ports.

### Media access

The scripts download the version selected by `MEDIA_VERSION`, compare its
SHA-256 against `MEDIA_ARCHIVE_SHA256`, and extract it into
`.media-cache/<version>/`. Both defaults are in [`.env.example`](../.env.example).
A verified cache is reused; interrupted downloads resume on the next run.

If the repository is private, cloning and media downloads require read access.
The scripts use `GITHUB_TOKEN` from the environment or `.env.local`, or an
existing `gh` login. Alternatively, download the archive from
[Releases](https://github.com/KoangWy/coveweft-swim/releases) and provide its path:

```sh
MEDIA_ARCHIVE_PATH=/path/to/coveweft-media-studio-v1.tar.gz ./scripts/demo.sh
```

```powershell
$env:MEDIA_ARCHIVE_PATH = "C:\path\to\coveweft-media-studio-v1.tar.gz"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo.ps1
```

This skips the media download; Docker still needs its images and build dependencies
on the first run.

### Assistant configuration

Set `AI_PRIMARY_API_KEY` in `.env.local`; optionally set `AI_FALLBACK_API_KEY`.
The default provider is Mistral, with `deepseek-v4-1-flash-1017` as primary and
`mistral-small-2603` as fallback. Change the `AI_*` settings to use another
compatible provider or model.

After editing keys, **rerun the demo script** to recreate the container with
current values. `docker restart` keeps the old container environment. For hot
reload, restart `pnpm dev` instead. Shopping works without an assistant key.

## Manual container setup

These Bash commands show the steps behind `scripts/demo.sh` for macOS/Linux.
Windows users can inspect [`scripts/demo.ps1`](../scripts/demo.ps1) for the
PowerShell equivalent. Use the scripts for routine starts and resets.

### 1. Start Supabase and configure the environment

```sh
supabase start
[ -f .env.local ] || cp .env.example .env.local
supabase status -o env
```

Copy the printed values into `.env.local` using this mapping:

| Supabase status   | `.env.local`                                           |
| ----------------- | ------------------------------------------------------ |
| `API_URL`         | `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL_INTERNAL` |
| `PUBLISHABLE_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                 |
| `SECRET_KEY`      | `SUPABASE_SECRET_KEY`                                  |

Keep values unquoted for Docker's `--env-file`. This example uses app port 3000
and the committed `studio-v1` media package.

### 2. Apply migrations and seed missing rows

```sh
supabase migration up
docker cp supabase/seed.sql supabase_db_coveweft-swim:/tmp/coveweft-seed.sql
docker exec supabase_db_coveweft-swim psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -f /tmp/coveweft-seed.sql
```

### 3. Download and verify the media

Save `coveweft-media-studio-v1.tar.gz` from
[Releases](https://github.com/KoangWy/coveweft-swim/releases/tag/media-studio-v1)
under `.media-cache/`, or let the block below download the public release.
Run the whole block in Bash; it stops on download or checksum failure before extraction:

```sh
(
  set -eu
  mkdir -p .media-cache/studio-v1
  ARCHIVE=.media-cache/coveweft-media-studio-v1.tar.gz
  if [ ! -f "$ARCHIVE" ]; then
    curl -fL -o "$ARCHIVE" \
      https://github.com/KoangWy/coveweft-swim/releases/download/media-studio-v1/coveweft-media-studio-v1.tar.gz
  fi
  DIGEST=$(sed -n 's/^MEDIA_ARCHIVE_SHA256=//p' .env.local)
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL=$(sha256sum "$ARCHIVE" | awk '{print $1}')
  else
    ACTUAL=$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')
  fi
  [ "$ACTUAL" = "$DIGEST" ] || { echo "Media checksum mismatch" >&2; exit 1; }
  tar -xzf "$ARCHIVE" -C .media-cache/studio-v1
  printf '%s' "$DIGEST" > .media-cache/studio-v1/.verified
)
```

### 4. Build, provision accounts, and start the app

```sh
PUBLISHABLE_KEY=$(sed -n 's/^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=//p' .env.local)
docker build -t coveweft-swim-app:local \
  --build-arg NEXT_PUBLIC_APP_URL=http://localhost:3000 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" .

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

If a previous app container exists, remove it with
`docker rm -f coveweft-swim-app` before the last command. Supabase data and the
media cache live outside that app container.

## Troubleshooting

| Symptom                          | Next step                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Docker cannot be reached         | Start Docker Desktop or your Docker runtime, then rerun the demo. On Linux, check that your user can access the daemon.                          |
| `supabase` is not found          | Install the global CLI above and reopen the terminal.                                                                                            |
| Port 3000 is busy                | Stop the other listener or set `APP_PORT=3100` as shown above.                                                                                   |
| Supabase fails to start          | Check the ports in [`supabase/config.toml`](../supabase/config.toml), including 54321–54324, and Docker memory. Run `supabase stop`, then retry. |
| Media download fails             | Check repository access, use `GITHUB_TOKEN` or an existing `gh` login, or pass `MEDIA_ARCHIVE_PATH`. Rerun to resume an interrupted download.    |
| Assistant is unavailable         | Check `AI_PRIMARY_API_KEY` and provider credit, then rerun the demo to apply the environment.                                                    |
| Photos are missing in hot reload | Check the `public/media` link and `MEDIA_BASE_URL` from the hot reload setup.                                                                    |
| App container exits              | Run `docker logs --tail 80 coveweft-swim-app` to see the error.                                                                                  |

The container demo has previously been run end to end on macOS with Docker
Desktop. Linux and Windows scripts are provided; equivalent end-to-end runs on
those systems have not been verified here.
