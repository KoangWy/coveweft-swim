import "server-only";

import { cache } from "react";

import type { Locale } from "@/lib/locale";
import { loadMyConversation } from "@/server/assistant";

/** Loads one conversation once per request, for metadata and the page. */
export const loadConversation = cache((id: string, locale: Locale) =>
  loadMyConversation(id, locale),
);
