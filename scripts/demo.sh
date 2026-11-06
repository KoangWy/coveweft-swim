#!/usr/bin/env bash
# Runs the COVEWEFT Swim demo locally on macOS or Linux.
#
# Needs only Docker and the Supabase CLI. The script starts the local Supabase
# stack, writes .env.local, applies pending migrations, loads the catalog seed,
# downloads and verifies the studio media, creates the demo accounts, and runs
# the app in a container on the Supabase Docker network.
#
# Running it again keeps the database and the media cache, so later runs are
# faster. Use scripts/reset.sh to reload the database.
#
# Optional environment variables:
#   APP_PORT            host port for the app (default 3000)
#   GITHUB_TOKEN        token with read access, needed while the media release
#                       is in a private repository
#   MEDIA_ARCHIVE_PATH  path to an already downloaded media archive
#   MEDIA_CACHE_DIR     where the extracted media is kept (default .media-cache)
#   MEDIA_REPOSITORY    GitHub repository that hosts the media release
set -euo pipefail

# shellcheck source=scripts/lib/local.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/local.sh"

MEDIA_REPOSITORY=${MEDIA_REPOSITORY:-KoangWy/coveweft-swim}
MEDIA_CACHE_DIR=${MEDIA_CACHE_DIR:-$ROOT_DIR/.media-cache}

STARTED_AT=$(date +%s)
CONTAINER_ENV=""
cleanup() {
  if [ -n "$CONTAINER_ENV" ]; then
    rm -f "$CONTAINER_ENV"
  fi
}
trap cleanup EXIT

apply_migrations() {
  step "Applying pending migrations"
  (cd "$ROOT_DIR" && supabase migration up) || fail "Could not apply the migrations." \
    "Run 'supabase migration list' to compare the local files with the database."
  ok "Database schema is up to date"
}

# The seed only inserts rows that are missing, so it is safe on every run and
# keeps orders, stock changes, and admin edits.
load_seed() {
  local db_container=$1
  step "Loading the catalog seed"
  docker cp "$ROOT_DIR/supabase/seed.sql" "$db_container:/tmp/coveweft-seed.sql" >/dev/null ||
    fail "Could not copy the seed into $db_container."
  docker exec "$db_container" psql --quiet --no-psqlrc -v ON_ERROR_STOP=1 \
    -U postgres -d postgres -f /tmp/coveweft-seed.sql >/dev/null ||
    fail "The catalog seed failed." "Run scripts/reset.sh to rebuild the local database."
  docker exec "$db_container" rm -f /tmp/coveweft-seed.sql
  ok "Catalog is loaded"
}

github_token() {
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    printf '%s' "$GITHUB_TOKEN"
    return
  fi
  local token
  token=$(env_value GITHUB_TOKEN "$ENV_FILE")
  if [ -z "$token" ] && command -v gh >/dev/null 2>&1; then
    token=$(gh auth token 2>/dev/null || true)
  fi
  printf '%s' "$token"
}

# Prints the API URL of one release asset. The GitHub API returns compact
# JSON; splitting it on commas leaves one field per line, and each asset lists
# its `url` before its `name`.
asset_api_url() {
  local release_json=$1 asset_name=$2
  printf '%s' "$release_json" | tr ',' '\n' | awk -v name="$asset_name" '
    /"url": *"https:\/\/api\.github\.com\/repos\/[^"]*\/releases\/assets\/[0-9]+"/ {
      url = $0
      sub(/.*"url": *"/, "", url)
      sub(/".*/, "", url)
    }
    $0 ~ "\"name\": *\"" name "\"" { print url; exit }
  '
}

download_archive() {
  local tag=$1 asset_name=$2 target=$3 token
  token=$(github_token)

  if [ -n "$token" ]; then
    info "Downloading $asset_name through the GitHub API."
    local release_json asset_url
    release_json=$(curl -fsSL \
      -H "Authorization: Bearer $token" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/$MEDIA_REPOSITORY/releases/tags/$tag") ||
      fail "Could not read release $tag of $MEDIA_REPOSITORY." \
        "Check that GITHUB_TOKEN can read the repository."
    asset_url=$(asset_api_url "$release_json" "$asset_name")
    [ -n "$asset_url" ] || fail "Release $tag has no asset named $asset_name."
    # curl drops the Authorization header when it follows the redirect to the
    # storage host.
    curl -fL --retry 3 --progress-bar -C - \
      -H "Authorization: Bearer $token" \
      -H "Accept: application/octet-stream" \
      -o "$target" "$asset_url" ||
      fail "The media download failed." "Run the script again; it resumes the download."
  else
    info "Downloading $asset_name from the public release."
    curl -fL --retry 3 --progress-bar -C - -o "$target" \
      "https://github.com/$MEDIA_REPOSITORY/releases/download/$tag/$asset_name" ||
      fail "The media download failed." \
        "If the repository is still private, set a token with read access and run again:" \
        "  GITHUB_TOKEN=<token> ./scripts/demo.sh" \
        "Or download $asset_name yourself and pass it in:" \
        "  MEDIA_ARCHIVE_PATH=/path/to/$asset_name ./scripts/demo.sh"
  fi
}

# Downloads the release archive for MEDIA_VERSION, checks it against
# MEDIA_ARCHIVE_SHA256, and extracts it into MEDIA_CACHE_DIR/<version>. A
# version that was already extracted and verified is skipped.
bootstrap_media() {
  step "Preparing studio media"
  local version expected
  version=$(env_value MEDIA_VERSION "$ENV_FILE")
  expected=$(env_value MEDIA_ARCHIVE_SHA256 "$ENV_FILE" | tr '[:upper:]' '[:lower:]')
  [ -n "$version" ] && [ -n "$expected" ] ||
    fail "MEDIA_VERSION and MEDIA_ARCHIVE_SHA256 must be set in .env.local." \
      "Copy them from .env.example."

  MEDIA_DIR="$MEDIA_CACHE_DIR/$version"
  local marker="$MEDIA_DIR/.verified"
  if [ -f "$marker" ] && [ "$(cat "$marker")" = "$expected" ] && [ -d "$MEDIA_DIR/studio" ]; then
    ok "Media $version is already verified in ${MEDIA_DIR#"$ROOT_DIR"/}"
    return
  fi

  mkdir -p "$MEDIA_CACHE_DIR"
  local asset_name="coveweft-media-$version.tar.gz"
  local archive downloaded=""
  if [ -n "${MEDIA_ARCHIVE_PATH:-}" ]; then
    archive=$MEDIA_ARCHIVE_PATH
    [ -f "$archive" ] || fail "MEDIA_ARCHIVE_PATH does not point to a file: $archive"
    info "Using the local archive $archive"
  else
    archive="$MEDIA_CACHE_DIR/$asset_name.part"
    if [ ! -f "$archive" ] || [ "$(sha256_of "$archive")" != "$expected" ]; then
      download_archive "media-$version" "$asset_name" "$archive"
    fi
    downloaded=$archive
  fi

  info "Verifying SHA-256"
  local actual
  actual=$(sha256_of "$archive")
  if [ "$actual" != "$expected" ]; then
    if [ -n "$downloaded" ]; then
      rm -f "$downloaded"
    fi
    fail "The media archive does not match MEDIA_ARCHIVE_SHA256." \
      "expected $expected" "actual   $actual" \
      "The partial download was removed; run the script again to download it from scratch."
  fi

  info "Extracting"
  local staging="$MEDIA_DIR.extracting"
  rm -rf "$staging" "$MEDIA_DIR"
  mkdir -p "$staging"
  tar -xzf "$archive" -C "$staging" || fail "Could not extract the media archive."

  local manifest="$ROOT_DIR/data/media/manifest-$version.json"
  if [ -f "$manifest" ]; then
    local images files
    images=$(sed -n 's/^[[:space:]]*"imageCount":[[:space:]]*\([0-9]*\),*$/\1/p' "$manifest" | head -n 1)
    files=$(find "$staging/studio" -type f -name '*.webp' | wc -l | tr -d ' ')
    if [ -n "$images" ] && [ "$files" -ne $((images * 3)) ]; then
      fail "The archive holds $files files; the manifest expects $((images * 3))."
    fi
  fi

  printf '%s' "$expected" >"$staging/.verified"
  mv "$staging" "$MEDIA_DIR"
  if [ -n "$downloaded" ]; then
    rm -f "$downloaded"
  fi
  ok "Media $version is ready in ${MEDIA_DIR#"$ROOT_DIR"/}"
}

build_app() {
  step "Building the app image"
  info "The first build installs dependencies and takes a few minutes; later builds reuse the cache."
  docker build \
    --build-arg NEXT_PUBLIC_APP_URL="$APP_URL" \
    --build-arg NEXT_PUBLIC_SUPABASE_URL="$(env_value NEXT_PUBLIC_SUPABASE_URL "$ENV_FILE")" \
    --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(env_value NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$ENV_FILE")" \
    -t "$APP_IMAGE" "$ROOT_DIR" || fail "The app image did not build." \
    "Scroll up for the build error. Make sure Docker has at least 4 GB of memory."
  ok "Image $APP_IMAGE is ready"
}

# The previous app container is replaced on every run, so remove it before
# checking that the port is free.
check_app_port() {
  docker rm -f "$APP_CONTAINER" >/dev/null 2>&1 || true
  if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "Port $APP_PORT is already in use." \
      "Stop the process that listens on it (lsof -nP -iTCP:$APP_PORT), or pick another port:" \
      "  APP_PORT=3100 ./scripts/demo.sh"
  fi
}

run_app() {
  local network=$1 env_file=$2
  step "Starting the app container"
  docker run -d --name "$APP_CONTAINER" \
    --network "$network" \
    --env-file "$env_file" \
    -p "$APP_PORT:3000" \
    -v "$MEDIA_DIR:/app/public/media:ro" \
    --restart unless-stopped \
    "$APP_IMAGE" >/dev/null || fail "Could not start the app container." \
    "If the port is taken, run again with another one: APP_PORT=3100 ./scripts/demo.sh"

  info "Waiting for $APP_URL"
  local attempt
  for attempt in $(seq 1 60); do
    if curl -fsS -o /dev/null "$APP_URL/en" 2>/dev/null; then
      ok "The app is up"
      return
    fi
    if [ "$(docker inspect -f '{{.State.Running}}' "$APP_CONTAINER" 2>/dev/null)" != "true" ]; then
      docker logs --tail 40 "$APP_CONTAINER" >&2 || true
      fail "The app container stopped." "See the log above, or run 'docker logs $APP_CONTAINER'."
    fi
    sleep 1
  done
  fail "The app did not answer within 60 seconds (attempt $attempt)." "Run 'docker logs $APP_CONTAINER' to see why."
}

main() {
  check_prerequisites
  check_app_port
  start_supabase
  write_env_file

  local id network db_container
  id=$(project_id)
  network="supabase_network_$id"
  db_container="supabase_db_$id"
  docker network inspect "$network" >/dev/null 2>&1 ||
    fail "The Supabase Docker network $network was not found." "Run 'supabase stop' and then this script again."

  apply_migrations
  load_seed "$db_container"
  bootstrap_media
  build_app

  CONTAINER_ENV=$(mktemp "${TMPDIR:-/tmp}/coveweft-env.XXXXXX")
  write_container_env "$CONTAINER_ENV" "http://supabase_kong_$id:8000"

  provision_accounts "$network" "$CONTAINER_ENV"
  run_app "$network" "$CONTAINER_ENV"

  local elapsed=$(($(date +%s) - STARTED_AT))
  printf '\n%sCOVEWEFT Swim is running%s (ready in %ss)\n' "$BOLD" "$RESET" "$elapsed"
  printf '    Store              %s/en  (Vietnamese: %s/vi)\n' "$APP_URL" "$APP_URL"
  printf '    Admin              %s/en/admin\n' "$APP_URL"
  printf '    Supabase Studio    %s\n' "$(status_value STUDIO_URL)"
  printf '    Mail (Mailpit)     %s\n' "$(status_value MAILPIT_URL)"
  print_accounts
  printf '\n    AI assistant: %s\n' "$(ai_key_state)"
  printf '    Stop:  docker stop %s && supabase stop   (data is kept)\n' "$APP_CONTAINER"
  printf '    Reset: ./scripts/reset.sh\n'
}

main "$@"
