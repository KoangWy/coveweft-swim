#!/usr/bin/env bash
# Resets the local COVEWEFT Swim database on macOS or Linux.
#
# Recreates the database from the migrations and supabase/seed.sql, then
# creates the demo accounts again. Orders, carts, registered accounts, and
# admin edits are deleted. The media cache and .env.local are kept.
#
# Usage: ./scripts/reset.sh [--yes]
set -euo pipefail

# shellcheck source=scripts/lib/local.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/local.sh"

ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    -y | --yes) ASSUME_YES=true ;;
    -h | --help)
      sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) fail "Unknown option: $arg" "Usage: ./scripts/reset.sh [--yes]" ;;
  esac
done

CONTAINER_ENV=""
cleanup() {
  if [ -n "$CONTAINER_ENV" ]; then
    rm -f "$CONTAINER_ENV"
  fi
}
trap cleanup EXIT

main() {
  check_prerequisites

  [ -f "$ENV_FILE" ] || fail ".env.local was not found." "Run ./scripts/demo.sh first."
  docker image inspect "$APP_IMAGE" >/dev/null 2>&1 ||
    fail "The app image $APP_IMAGE was not found." "Run ./scripts/demo.sh first."

  printf '\n%sThis deletes all local orders, carts, accounts, and admin edits.%s\n' "$BOLD" "$RESET"
  printf 'The database is rebuilt from the migrations and the catalog seed.\n'
  if [ "$ASSUME_YES" != true ]; then
    if [ ! -t 0 ]; then
      fail "No terminal to confirm the reset." "Run ./scripts/reset.sh --yes to skip the question."
    fi
    local answer
    read -r -p "Type 'reset' to continue: " answer
    if [ "$answer" != "reset" ]; then
      printf 'Cancelled. Nothing was changed.\n'
      exit 0
    fi
  fi

  start_supabase

  step "Resetting the database"
  (cd "$ROOT_DIR" && supabase db reset) || fail "supabase db reset failed." \
    "Scroll up for the error, then run the reset again."
  ok "Database rebuilt from migrations and seed"

  load_supabase_status
  local id network
  id=$(project_id)
  network="supabase_network_$id"
  CONTAINER_ENV=$(mktemp "${TMPDIR:-/tmp}/coveweft-env.XXXXXX")
  write_container_env "$CONTAINER_ENV" "http://supabase_kong_$id:8000"
  provision_accounts "$network" "$CONTAINER_ENV"

  # Sessions from before the reset point at deleted accounts.
  if docker container inspect "$APP_CONTAINER" >/dev/null 2>&1; then
    step "Restarting the app container"
    docker restart "$APP_CONTAINER" >/dev/null
    ok "Restarted"
  fi

  printf '\n%sReset complete.%s Open %s/en and sign in again.\n' "$BOLD" "$RESET" "$APP_URL"
  print_accounts
}

main "$@"
