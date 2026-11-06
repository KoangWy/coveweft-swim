import { connection } from "next/server";

import { LocaleSwitcherLinks } from "./locale-switcher-links";

/**
 * EN/VI switch for the current page. Its links carry the current query
 * string, which only exists per request, so the switch opts the page into
 * request-time rendering. Without that, prerendered HTML would link to the
 * other locale without the query until JavaScript loads.
 */
export async function LocaleSwitcher({ tone = "light" }: { tone?: "light" | "dark" }) {
  await connection();
  return <LocaleSwitcherLinks tone={tone} />;
}
