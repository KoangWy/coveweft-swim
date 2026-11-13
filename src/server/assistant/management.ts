import "server-only";

import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Locale } from "@/lib/locale";
import { getAuthenticatedUser } from "@/server/auth/guard";
import { fail, ok, type Result } from "@/server/errors";
import { parseInput, runService } from "@/server/result";

import { loadProductCards } from "./cards";
import {
  deleteAllConversations,
  deleteConversation,
  getConversation,
  listConversations,
  listMessages,
  type ConversationPage,
  type ConversationSummary,
} from "./conversations";
import type { ProductCard } from "./tools";

const ListConversationsInput = z
  .object({ cursor: z.string().max(512).nullable().optional() })
  .strict();

const ConversationIdInput = z.object({ id: z.uuid() }).strict();

/** Enough cards for a long transcript without trusting an unbounded row. */
const MAX_CARDS_PER_CONVERSATION = 120;

export type ConversationMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards: ProductCard[];
  interrupted: boolean;
};

export type ConversationView = {
  conversation: ConversationSummary;
  messages: ConversationMessageView[];
};

/** One page of the signed-in customer's conversations, newest first. */
export async function listMyConversations(input: unknown = {}): Promise<Result<ConversationPage>> {
  return runService(async () => {
    const parsed = parseInput(ListConversationsInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user.ok) {
      return user;
    }

    return ok(await listConversations(supabase, user.data.id, parsed.data.cursor ?? null));
  });
}

/**
 * Loads one conversation for the Assistant page. RLS limits the read to the
 * signed-in customer, and the explicit owner check keeps a mismatch a 404.
 */
export async function loadMyConversation(
  id: string,
  locale: Locale,
): Promise<Result<ConversationView>> {
  return runService(async () => {
    const parsed = ConversationIdInput.safeParse({ id });

    if (!parsed.success) {
      return fail("NOT_FOUND");
    }

    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user.ok) {
      return user;
    }

    const conversation = await getConversation(supabase, parsed.data.id);

    if (!conversation || conversation.userId !== user.data.id) {
      return fail("NOT_FOUND");
    }

    const rows = await listMessages(supabase, conversation.id);
    const uniqueSkus = [...new Set(rows.flatMap((message) => message.productSkus))];
    const cards = await loadProductCards(uniqueSkus, locale, {
      limit: Math.min(uniqueSkus.length, MAX_CARDS_PER_CONVERSATION),
    });
    const bySku = new Map(cards.map((card) => [card.sku, card]));
    const messages = rows
      .map((message) => {
        const messageCards = message.productSkus
          .map((sku) => bySku.get(sku))
          .filter((card): card is ProductCard => card !== undefined);

        return {
          id: message.id,
          role: message.role,
          content: message.content,
          cards: messageCards,
          interrupted: message.status !== "complete",
        };
      })
      // A turn that failed before any text only records the failure; there is
      // nothing to show in the transcript.
      .filter((message) => message.content !== "" || message.cards.length > 0);

    return ok({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
      },
      messages,
    });
  });
}

/** Deletes one conversation of the signed-in customer, cascading its messages. */
export async function deleteMyConversation(input: unknown): Promise<Result<{ id: string }>> {
  return runService(async () => {
    const parsed = parseInput(ConversationIdInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user.ok) {
      return user;
    }

    await deleteConversation(createSupabaseAdminClient(), user.data.id, parsed.data.id);

    return ok({ id: parsed.data.id });
  });
}

/** Deletes every conversation of the signed-in customer. */
export async function deleteAllMyConversations(): Promise<Result<{ deleted: number }>> {
  return runService(async () => {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user.ok) {
      return user;
    }

    const deleted = await deleteAllConversations(createSupabaseAdminClient(), user.data.id);

    return ok({ deleted });
  });
}
