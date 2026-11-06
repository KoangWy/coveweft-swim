/**
 * Explicit cookie name for the Supabase auth session.
 *
 * The browser client uses the public Supabase URL while the server client uses
 * the internal URL (for example `http://kong:8000` on the Docker network).
 * supabase-js derives its default storage key from the URL hostname, so
 * without an explicit name the browser and server would read different
 * cookies and the session would not be shared.
 */
export const SUPABASE_AUTH_COOKIE_NAME = "sb-coveweft-auth-token";
