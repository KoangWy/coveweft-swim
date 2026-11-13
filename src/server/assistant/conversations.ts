import { z } from "zod";

import type { SupabaseClient } from "@supabase/supabase-js";

import { throwDatabaseError } from "@/server/db/throw";
import { ServiceError } from "@/server/result";

/** Conversations shown in the rail, newest activity first. */
export const CONVERSATION_PAGE_SIZE = 20;
/** Longest title derived from the first question, in characters. */
export const CONVERSATION_TITLE_CHARS = 60;

export type MessageRole = "user" | "assistant";
export type MessageStatus = "complete" | "interrupted" | "failed";

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export type StoredConversation = ConversationSummary & {
  userId: string;
  createdAt: string;
};

export type StoredMessage = {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  productSkus: string[];
  createdAt: string;
};

export type ConversationPage = {
  items: ConversationSummary[];
  nextCursor: string | null;
};

type ConversationRow = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  product_skus: string[];
  created_at: string;
};

const CONVERSATION_COLUMNS = "id, user_id, title, created_at, updated_at";
const MESSAGE_COLUMNS = "id, role, content, status, product_skus, created_at";

const Cursor = z.object({
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/),
  id: z.uuid(),
});

function mapConversation(row: ConversationRow): StoredConversation {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    status: row.status,
    productSkus: row.product_skus,
    createdAt: row.created_at,
  };
}

/**
 * Builds the title of a new conversation from its first question: at most
 * `CONVERSATION_TITLE_CHARS` characters, cut at a word boundary when one is
 * available. No model call is involved.
 */
export function titleFromQuestion(question: string): string {
  const text = question.replace(/\s+/g, " ").trim();

  if (text.length <= CONVERSATION_TITLE_CHARS) {
    return text;
  }

  const head = text.slice(0, CONVERSATION_TITLE_CHARS);
  const boundary = head.lastIndexOf(" ");
  const title = (boundary > 0 ? head.slice(0, boundary) : head).trim();

  return title === "" ? head : title;
}

/** Opaque keyset cursor for the conversation rail. */
export function encodeConversationCursor(item: ConversationSummary): string {
  return Buffer.from(JSON.stringify({ updatedAt: item.updatedAt, id: item.id })).toString(
    "base64url",
  );
}

export function decodeConversationCursor(value: string): { updatedAt: string; id: string } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new ServiceError("VALIDATION_ERROR", { reason: "invalid_cursor" });
  }

  const cursor = Cursor.safeParse(parsed);

  if (!cursor.success) {
    throw new ServiceError("VALIDATION_ERROR", { reason: "invalid_cursor" });
  }

  return cursor.data;
}

/**
 * Lists one page of a customer's conversations, newest activity first. The
 * caller supplies a session client, so RLS also limits the rows.
 */
export async function listConversations(
  client: SupabaseClient,
  userId: string,
  cursor: string | null,
): Promise<ConversationPage> {
  let query = client
    .from("assistant_conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(CONVERSATION_PAGE_SIZE + 1);

  if (cursor) {
    const { updatedAt, id } = decodeConversationCursor(cursor);
    query = query.or(
      `updated_at.lt."${updatedAt}",and(updated_at.eq."${updatedAt}",id.lt."${id}")`,
    );
  }

  const { data, error } = await query;

  if (error) {
    throwDatabaseError(error);
  }

  const rows = (data ?? []) as Array<Pick<ConversationRow, "id" | "title" | "updated_at">>;
  const items = rows.slice(0, CONVERSATION_PAGE_SIZE).map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
  }));
  const last = items.at(-1);

  return {
    items,
    nextCursor:
      rows.length > CONVERSATION_PAGE_SIZE && last ? encodeConversationCursor(last) : null,
  };
}

/** Reads one conversation visible to the session client. */
export async function getConversation(
  client: SupabaseClient,
  id: string,
): Promise<StoredConversation | null> {
  const { data, error } = await client
    .from("assistant_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throwDatabaseError(error);
  }

  return data ? mapConversation(data as ConversationRow) : null;
}

/** Reads one conversation only when it belongs to `userId`. */
export async function findConversation(
  client: SupabaseClient,
  userId: string,
  id: string,
): Promise<StoredConversation | null> {
  const { data, error } = await client
    .from("assistant_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throwDatabaseError(error);
  }

  return data ? mapConversation(data as ConversationRow) : null;
}

/** Reads a whole transcript in insertion order. */
export async function listMessages(
  client: SupabaseClient,
  conversationId: string,
): Promise<StoredMessage[]> {
  const { data, error } = await client
    .from("assistant_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throwDatabaseError(error);
  }

  return ((data ?? []) as MessageRow[]).map(mapMessage);
}

/** Reads the newest `limit` messages, returned oldest first for the model. */
export async function recentMessages(
  client: SupabaseClient,
  conversationId: string,
  limit: number,
): Promise<StoredMessage[]> {
  const { data, error } = await client
    .from("assistant_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    throwDatabaseError(error);
  }

  return ((data ?? []) as MessageRow[]).map(mapMessage).reverse();
}

export async function createConversation(
  client: SupabaseClient,
  userId: string,
  title: string,
): Promise<StoredConversation> {
  const { data, error } = await client
    .from("assistant_conversations")
    .insert({ user_id: userId, title })
    .select(CONVERSATION_COLUMNS)
    .single();

  if (error) {
    throwDatabaseError(error);
  }

  return mapConversation(data as ConversationRow);
}

/** Marks a conversation as changed, and proves it belongs to `userId`. */
export async function touchConversation(
  client: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<void> {
  const { data, error } = await client
    .from("assistant_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", userId)
    .select("id");

  if (error) {
    throwDatabaseError(error);
  }

  if (!data || data.length === 0) {
    throw new ServiceError("NOT_FOUND", { conversationId });
  }
}

type AppendMessageInput = {
  role: MessageRole;
  content: string;
  status?: MessageStatus;
  productSkus?: string[];
};

/** Appends one turn after proving the conversation belongs to the customer. */
export async function appendMessage(
  client: SupabaseClient,
  userId: string,
  conversationId: string,
  message: AppendMessageInput,
): Promise<StoredMessage> {
  await touchConversation(client, userId, conversationId);

  const { data, error } = await client
    .from("assistant_messages")
    .insert({
      conversation_id: conversationId,
      role: message.role,
      content: message.content,
      status: message.status ?? "complete",
      product_skus: message.productSkus ?? [],
    })
    .select(MESSAGE_COLUMNS)
    .single();

  if (error) {
    throwDatabaseError(error);
  }

  return mapMessage(data as MessageRow);
}

/**
 * Appends a customer question, reusing the same unanswered question when the
 * last turn is that question, with or without a failed empty answer after it.
 * Retrying therefore does not duplicate the question in the transcript.
 */
export async function appendUserMessage(
  client: SupabaseClient,
  userId: string,
  conversationId: string,
  content: string,
): Promise<StoredMessage> {
  const { data, error } = await client
    .from("assistant_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(2);

  if (error) {
    throwDatabaseError(error);
  }

  const rows = (data ?? []) as MessageRow[];
  const last = rows[0];
  const before = rows[1];
  const unanswered =
    last?.role === "user"
      ? last
      : last?.role === "assistant" && last.status === "failed"
        ? before
        : undefined;

  if (unanswered?.role === "user" && unanswered.content === content) {
    await touchConversation(client, userId, conversationId);
    return mapMessage(unanswered);
  }

  return appendMessage(client, userId, conversationId, { role: "user", content });
}

/** Deletes one conversation and its messages; other owners are not affected. */
export async function deleteConversation(
  client: SupabaseClient,
  userId: string,
  id: string,
): Promise<void> {
  const { data, error } = await client
    .from("assistant_conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");

  if (error) {
    throwDatabaseError(error);
  }

  if (!data || data.length === 0) {
    throw new ServiceError("NOT_FOUND", { conversationId: id });
  }
}

/** Deletes every conversation of one customer and returns how many rows went. */
export async function deleteAllConversations(
  client: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await client
    .from("assistant_conversations")
    .delete()
    .eq("user_id", userId)
    .select("id");

  if (error) {
    throwDatabaseError(error);
  }

  return data?.length ?? 0;
}

/**
 * The subset of the repository the chat route uses. Every method filters by
 * the verified `userId`, so a client-supplied id never grants access.
 */
export type ConversationStore = {
  findConversation(userId: string, id: string): Promise<StoredConversation | null>;
  createConversation(userId: string, title: string): Promise<StoredConversation>;
  appendUserMessage(
    userId: string,
    conversationId: string,
    content: string,
  ): Promise<StoredMessage>;
  appendAssistantMessage(
    userId: string,
    conversationId: string,
    message: { content: string; status: MessageStatus; productSkus: string[] },
  ): Promise<StoredMessage>;
  recentMessages(conversationId: string, limit: number): Promise<StoredMessage[]>;
};

export function createDatabaseConversationStore(client: SupabaseClient): ConversationStore {
  return {
    findConversation: (userId, id) => findConversation(client, userId, id),
    createConversation: (userId, title) => createConversation(client, userId, title),
    appendUserMessage: (userId, conversationId, content) =>
      appendUserMessage(client, userId, conversationId, content),
    appendAssistantMessage: (userId, conversationId, message) =>
      appendMessage(client, userId, conversationId, {
        role: "assistant",
        content: message.content,
        status: message.status,
        productSkus: message.productSkus,
      }),
    recentMessages: (conversationId, limit) => recentMessages(client, conversationId, limit),
  };
}
