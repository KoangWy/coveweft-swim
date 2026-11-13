"use server";

import type { Result } from "@/server/errors";
import {
  deleteAllMyConversations,
  deleteMyConversation,
  listMyConversations,
} from "@/server/assistant";

import type { AssistantConversationPage } from "./components/assistant-chat";

/** Loads the next page of the account's conversations for the rail. */
export async function loadConversationsAction(
  cursor: string | null,
): Promise<Result<AssistantConversationPage>> {
  return listMyConversations({ cursor });
}

export async function deleteConversationAction(id: string): Promise<Result<{ id: string }>> {
  return deleteMyConversation({ id });
}

export async function deleteAllConversationsAction(): Promise<Result<{ deleted: number }>> {
  return deleteAllMyConversations();
}
