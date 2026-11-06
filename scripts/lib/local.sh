# shellcheck shell=bash
# Shared helpers for scripts/demo.sh and scripts/reset.sh (macOS and Linux).
# Source this file; it does not run anything on its own.
# shellcheck disable=SC2034  # Variables are used by the sourcing scripts.

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
ENV_FILE="$ROOT_DIR/.env.local"
ENV_EXAMPLE="$ROOT_DIR/.env.example"
APP_IMAGE="coveweft-swim-app:local"
APP_CONTAINER="coveweft-swim-app"
APP_PORT=${APP_PORT:-3000}
APP_URL="http://localhost:$APP_PORT"

if [ -t 1 ]; then
  BOLD=$'\033[1m'
  RED=$'\033[31m'
  GREEN=$'\033[32m'
  RESET=$'\033[0m'
else
  BOLD=""
  RED=""
  GREEN=""
  RESET=""
fi

step() {
  printf '\n%s==> %s%s\n' "$BOLD" "$1" "$RESET"
}

info() {
  printf '    %s\n' "$1"
}

ok() {
  printf '    %s%s%s\n' "$GREEN" "$1" "$RESET"
}

fail() {
  printf '\n%sError:%s %s\n' "$RED" "$RESET" "$1" >&2
  shift
  for line in "$@"; do
    printf '       %s\n' "$line" >&2
  done
  exit 1
}

# Checks that Docker is installed and running and that the Supabase CLI is
# available. Every failure prints the next step to take.
check_prerequisites() {
  step "Checking prerequisites"

  if ! command -v docker >/dev/null 2>&1; then
    fail "Docker is not installed." \
      "macOS: install Docker Desktop (https://docs.docker.com/desktop/setup/install/mac-install/)" \
      "       or another Docker-compatible runtime such as OrbStack or Colima." \
      "Linux: install Docker Engine (https://docs.docker.com/engine/install/)."
  fi

  local docker_error
  if ! docker_error=$(docker info 2>&1 >/dev/null); then
    if printf '%s' "$docker_error" | grep -qi "permission denied"; then
      fail "Docker is installed but this user cannot reach the Docker daemon." \
        "Linux: add yourself to the docker group, then log out and back in:" \
        "  sudo usermod -aG docker \"\$USER\""
    fi
    fail "Docker is installed but not running." \
      "macOS: open Docker Desktop (or start your runtime, e.g. 'colima start') and wait until it is ready." \
      "Linux: sudo systemctl start docker"
  fi
  ok "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '(unknown version)')"

  if ! command -v supabase >/dev/null 2>&1; then
    fail "The Supabase CLI is not installed." \
      "macOS: brew install supabase/tap/supabase" \
      "Linux: brew install supabase/tap/supabase, or install the .deb/.rpm/.apk package from" \
      "       https://github.com/supabase/cli/releases" \
      "See https://supabase.com/docs/guides/local-development/cli/getting-started"
  fi
  ok "Supabase CLI $(supabase --version 2>/dev/null | head -n 1)"

  local tool
  for tool in curl tar; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      fail "'$tool' is required but was not found." "Install it with your system package manager."
    fi
  done

  if ! command -v shasum >/dev/null 2>&1 && ! command -v sha256sum >/dev/null 2>&1; then
    fail "No SHA-256 tool was found (shasum or sha256sum)." \
      "Linux: install coreutils (Debian/Ubuntu: sudo apt-get install coreutils)."
  fi
}

# Prints the SHA-256 digest of a file.
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    shasum -a 256 "$1" | awk '{ print $1 }'
  fi
}

# Reads `project_id` from supabase/config.toml. The CLI names its containers
# and network after it.
project_id() {
  local id
  id=$(sed -n 's/^project_id[[:space:]]*=[[:space:]]*"\(.*\)"[[:space:]]*$/\1/p' "$ROOT_DIR/supabase/config.toml" | head -n 1)
  [ -n "$id" ] || fail "Could not read project_id from supabase/config.toml."
  printf '%s' "$id"
}

supabase_running() {
  (cd "$ROOT_DIR" && supabase status >/dev/null 2>&1)
}

# Starts the local Supabase stack unless it is already running. The first
# start creates the database and applies the migrations and seed.
start_supabase() {
  step "Starting local Supabase"
  if supabase_running; then
    ok "Already running"
    return
  fi
  info "The first start downloads the Supabase images and can take several minutes."
  (cd "$ROOT_DIR" && supabase start) || fail "supabase start failed." \
    "Check that ports 54321-54324 are free and that Docker has enough memory (4 GB or more)." \
    "Then run the script again; 'supabase stop' first if the stack is half started."
  ok "Supabase is running"
}

# Prints one value from `supabase status -o env`.
status_value() {
  printf '%s\n' "$SUPABASE_STATUS" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}\$/\1/p" | head -n 1
}

load_supabase_status() {
  SUPABASE_STATUS=$(cd "$ROOT_DIR" && supabase status -o env 2>/dev/null) ||
    fail "Could not read 'supabase status'." "Run 'supabase status' to see what is wrong."
}

# Prints the value of KEY in an env file, without surrounding quotes.
env_value() {
  local file=$2
  [ -f "$file" ] || return 0
  awk -v key="$1" '
    {
      line = $0
      sub(/\r$/, "", line)
      if (line ~ /^[[:space:]]*#/) next
      eq = index(line, "=")
      if (eq == 0) next
      name = substr(line, 1, eq - 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (name != key) next
      value = substr(line, eq + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      if (value ~ /^".*"$/ || value ~ /^'\''.*'\''$/) value = substr(value, 2, length(value) - 2)
      result = value
    }
    END { printf "%s", result }
  ' "$file"
}

# Sets KEY=VALUE in .env.local, replacing an existing line or appending one.
set_env_value() {
  local tmp
  tmp=$(mktemp "$ENV_FILE.XXXXXX")
  KEY="$1" VALUE="$2" awk '
    BEGIN { key = ENVIRON["KEY"]; value = ENVIRON["VALUE"]; done = 0 }
    {
      line = $0
      sub(/\r$/, "", line)
      eq = index(line, "=")
      name = eq ? substr(line, 1, eq - 1) : ""
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (!done && line !~ /^[[:space:]]*#/ && name == key) {
        print key "=" value
        done = 1
        next
      }
      print line
    }
    END { if (!done) print key "=" value }
  ' "$ENV_FILE" >"$tmp"
  mv "$tmp" "$ENV_FILE"
}

# Creates .env.local from .env.example on the first run. Later runs refresh
# only the values that come from the local Supabase stack and fill in keys
# that are missing or empty, so AI keys and other edits are kept.
write_env_file() {
  step "Writing .env.local"
  load_supabase_status

  local api_url publishable_key secret_key
  api_url=$(status_value API_URL)
  publishable_key=$(status_value PUBLISHABLE_KEY)
  secret_key=$(status_value SECRET_KEY)
  [ -n "$publishable_key" ] && [ -n "$secret_key" ] ||
    fail "'supabase status' did not print PUBLISHABLE_KEY and SECRET_KEY." \
      "Update the Supabase CLI to a current version and run the script again."

  if [ -f "$ENV_FILE" ]; then
    info "Keeping your existing .env.local and refreshing the local Supabase values."
  else
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    info "Created .env.local from .env.example."
  fi

  set_env_value NEXT_PUBLIC_SUPABASE_URL "$api_url"
  set_env_value NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$publishable_key"
  set_env_value SUPABASE_SECRET_KEY "$secret_key"
  if [ -z "$(env_value SUPABASE_URL_INTERNAL "$ENV_FILE")" ]; then
    set_env_value SUPABASE_URL_INTERNAL "$api_url"
  fi

  # Fill keys added to .env.example after .env.local was created.
  local key default
  while IFS= read -r key; do
    default=$(env_value "$key" "$ENV_EXAMPLE")
    if [ -n "$default" ] && [ -z "$(env_value "$key" "$ENV_FILE")" ]; then
      set_env_value "$key" "$default"
    fi
  done < <(sed -n 's/^\([A-Z][A-Z0-9_]*\)=.*/\1/p' "$ENV_EXAMPLE")

  ok ".env.local is ready (AI keys: $(ai_key_state))"
}

ai_key_state() {
  if [ -n "$(env_value AI_PRIMARY_API_KEY "$ENV_FILE")" ]; then
    printf 'primary key set'
  else
    printf 'not set, the assistant will report that it is not configured'
  fi
}

# Writes a copy of .env.local that `docker run --env-file` can read: no
# comments and no quotes. The server-side Supabase URL points at the API
# gateway on the Supabase Docker network, and the app and media URLs follow
# APP_PORT because the container serves the extracted media itself.
write_container_env() {
  local out=$1 internal_url=$2
  awk -v internal="$internal_url" -v app_url="$APP_URL" '
    {
      line = $0
      sub(/\r$/, "", line)
      if (line ~ /^[[:space:]]*#/ || line ~ /^[[:space:]]*$/) next
      eq = index(line, "=")
      if (eq == 0) next
      name = substr(line, 1, eq - 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      value = substr(line, eq + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      if (value ~ /^".*"$/ || value ~ /^'\''.*'\''$/) value = substr(value, 2, length(value) - 2)
      if (name == "SUPABASE_URL_INTERNAL") value = internal
      if (name == "NEXT_PUBLIC_APP_URL") value = app_url
      if (name == "MEDIA_BASE_URL") value = app_url "/media"
      print name "=" value
    }
  ' "$ENV_FILE" >"$out"
}

# Creates the demo customer and administrator inside the app image, so the
# host does not need Node.js.
provision_accounts() {
  local network=$1 env_file=$2
  step "Provisioning demo accounts"
  docker run --rm --network "$network" --env-file "$env_file" "$APP_IMAGE" \
    node scripts/provision-demo.mjs ||
    fail "Could not create the demo accounts." "Check that Supabase is running ('supabase status')."
}

print_accounts() {
  printf '\n%sDemo accounts (local only)%s\n' "$BOLD" "$RESET"
  printf '    Customer       %s / %s\n' \
    "$(env_value DEMO_CUSTOMER_EMAIL "$ENV_FILE")" "$(env_value DEMO_CUSTOMER_PASSWORD "$ENV_FILE")"
  printf '    Administrator  %s / %s\n' \
    "$(env_value DEMO_ADMIN_EMAIL "$ENV_FILE")" "$(env_value DEMO_ADMIN_PASSWORD "$ENV_FILE")"
}
