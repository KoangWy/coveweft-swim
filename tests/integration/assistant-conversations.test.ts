import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", async () => {
  const { serviceClientState } = await import("./support/service-context");

  return {
    createSupabaseServerClient: async () => {
      if (!serviceClientState.current) {
        throw new Error("No service client selected for this test.");
      }

      return serviceClientState.current;
    },
  };
});

import type { AiConfig } from "@/lib/config/env";
import type { ChatProvider } from "@/server/ai";
import {
  chatDependencies,
  createDatabaseConversationStore,
  deleteAllMyConversations,
  deleteMyConversation,
  handleChatRequest,
  listMyConversations,
  loadMyConversation,
  type ChatDependencies,
  type QuotaStore,
} from "@/server/assistant";
import {
  createAnonClient,
  createCustomer,
  createServiceClient,
  deleteUsers,
  type TestUser,
} from "./support/clients";
import { selectServiceClient } from "./support/service-context";

function conversationRow(userId: string, title: string, offsetMinutes = 0) {
  const stamp = new Date(Date.now() - offsetMinutes * 60_000).toISOString();

  return {
    user_id: userId,
    title,
    created_at: stamp,
    updated_at: stamp,
  };
}

describe("assistant conversations", () => {
  const service = createServiceClient();
  const users: TestUser[] = [];
  let customerA: TestUser;
  let customerB: TestUser;
  let fixture: { conversationId: string };

  beforeAll(async () => {
    customerA = await createCustomer(service, "assistant-a");
    customerB = await createCustomer(service, "assistant-b");
    users.push(customerA, customerB);

    const created = await service
      .from("assistant_conversations")
      .insert(conversationRow(customerA.id, "Customer A conversation"))
      .select("id")
      .single();

    if (created.error) {
      throw created.error;
    }

    fixture = { conversationId: created.data.id as string };
  });

  afterAll(async () => {
    await deleteUsers(service, users);
  });

  it("keeps each conversation readable only by its owner", async () => {
    const message = await service.from("assistant_messages").insert({
      conversation_id: fixture.conversationId,
      role: "user",
      content: "A private question",
    });

    if (message.error) {
      throw message.error;
    }

    const ownConversation = await customerA.client
      .from("assistant_conversations")
      .select("id, title")
      .eq("id", fixture.conversationId);
    const ownMessages = await customerA.client
      .from("assistant_messages")
      .select("content")
      .eq("conversation_id", fixture.conversationId);

    expect(ownConversation.error).toBeNull();
    expect(ownConversation.data).toHaveLength(1);
    expect(ownMessages.data?.map((row) => row.content)).toEqual(["A private question"]);

    const otherConversation = await customerB.client
      .from("assistant_conversations")
      .select("id")
      .eq("id", fixture.conversationId);
    const otherMessages = await customerB.client
      .from("assistant_messages")
      .select("content")
      .eq("conversation_id", fixture.conversationId);

    expect(otherConversation.error).toBeNull();
    expect(otherConversation.data).toEqual([]);
    expect(otherMessages.error).toBeNull();
    expect(otherMessages.data).toEqual([]);
  });

  it("gives visitors no access and customers no direct write", async () => {
    const anon = createAnonClient();
    const read = await anon.from("assistant_conversations").select("id");
    const write = await anon.from("assistant_conversations").insert({
      user_id: customerA.id,
      title: "Anon write",
    });

    expect(read.error).not.toBeNull();
    expect(write.error).not.toBeNull();

    const insert = await customerA.client.from("assistant_conversations").insert({
      user_id: customerA.id,
      title: "Customer write",
    });
    const update = await customerA.client
      .from("assistant_conversations")
      .update({ title: "Customer update" })
      .eq("id", fixture.conversationId)
      .select("id");
    const remove = await customerA.client
      .from("assistant_conversations")
      .delete()
      .eq("id", fixture.conversationId)
      .select("id");

    expect(insert.error).not.toBeNull();
    expect(update.error).not.toBeNull();
    expect(remove.error).not.toBeNull();

    const stillThere = await service
      .from("assistant_conversations")
      .select("id")
      .eq("id", fixture.conversationId)
      .maybeSingle();

    expect(stillThere.data?.id).toBe(fixture.conversationId);
  });

  it("enforces the message shape and cascades deletes", async () => {
    const emptyUser = await service.from("assistant_messages").insert({
      conversation_id: fixture.conversationId,
      role: "user",
      content: "",
    });
    const userWithProducts = await service.from("assistant_messages").insert({
      conversation_id: fixture.conversationId,
      role: "user",
      content: "Question",
      product_skus: ["AIMEE"],
    });
    const failedAssistant = await service.from("assistant_messages").insert({
      conversation_id: fixture.conversationId,
      role: "assistant",
      content: "",
      status: "failed",
    });
    const tooLongTitle = await service.from("assistant_conversations").insert({
      user_id: customerA.id,
      title: "x".repeat(121),
    });

    expect(emptyUser.error).not.toBeNull();
    expect(userWithProducts.error).not.toBeNull();
    expect(failedAssistant.error).toBeNull();
    expect(tooLongTitle.error).not.toBeNull();

    const deleted = await service
      .from("assistant_conversations")
      .delete()
      .eq("id", fixture.conversationId);

    if (deleted.error) {
      throw deleted.error;
    }

    const messages = await service
      .from("assistant_messages")
      .select("id")
      .eq("conversation_id", fixture.conversationId);

    expect(messages.data).toEqual([]);

    const recreated = await service
      .from("assistant_conversations")
      .insert(conversationRow(customerA.id, "Customer A conversation"))
      .select("id")
      .single();

    if (recreated.error) {
      throw recreated.error;
    }

    fixture.conversationId = recreated.data.id as string;
  });

  it("cascades an account deletion to conversations and messages", async () => {
    const temporary = await createCustomer(service, "assistant-cascade");
    users.push(temporary);
    const conversation = await service
      .from("assistant_conversations")
      .insert(conversationRow(temporary.id, "Temporary conversation"))
      .select("id")
      .single();

    if (conversation.error) {
      throw conversation.error;
    }

    const message = await service.from("assistant_messages").insert({
      conversation_id: conversation.data.id,
      role: "user",
      content: "Delete me with the account",
    });

    if (message.error) {
      throw message.error;
    }

    const removed = await service.auth.admin.deleteUser(temporary.id);

    if (removed.error) {
      throw removed.error;
    }

    const conversations = await service
      .from("assistant_conversations")
      .select("id")
      .eq("id", conversation.data.id);
    const messages = await service
      .from("assistant_messages")
      .select("id")
      .eq("conversation_id", conversation.data.id);

    expect(conversations.data).toEqual([]);
    expect(messages.data).toEqual([]);
  });

  it("lists twenty conversations per page, newest activity first", async () => {
    const rows = Array.from({ length: 22 }, (_, index) =>
      conversationRow(customerB.id, `Conversation ${index}`, index),
    );
    const seeded = await service.from("assistant_conversations").insert(rows);

    if (seeded.error) {
      throw seeded.error;
    }

    selectServiceClient(customerB.client);
    const first = await listMyConversations({});

    expect(first.ok).toBe(true);

    if (!first.ok) {
      return;
    }

    expect(first.data.items).toHaveLength(20);
    expect(first.data.items[0]?.title).toBe("Conversation 0");
    expect(first.data.nextCursor).not.toBeNull();

    const second = await listMyConversations({ cursor: first.data.nextCursor });

    expect(second.ok).toBe(true);

    if (!second.ok) {
      return;
    }

    expect(second.data.items.map((item) => item.title)).toEqual([
      "Conversation 20",
      "Conversation 21",
    ]);
    expect(second.data.nextCursor).toBeNull();
  });

  it("deduplicates a retried question and keeps an empty failed answer", async () => {
    selectServiceClient(customerA.client);
    const store = createDatabaseConversationStore(service);
    const conversation = await store.createConversation(customerA.id, "Retry");

    const first = await store.appendUserMessage(customerA.id, conversation.id, "Same question");
    const retried = await store.appendUserMessage(customerA.id, conversation.id, "Same question");

    expect(retried.id).toBe(first.id);

    const failed = await store.appendAssistantMessage(customerA.id, conversation.id, {
      content: "",
      status: "failed",
      productSkus: [],
    });
    const afterFailure = await store.appendUserMessage(
      customerA.id,
      conversation.id,
      "Same question",
    );

    expect(afterFailure.id).toBe(first.id);
    expect(failed.status).toBe("failed");
    expect((await store.recentMessages(conversation.id, 10)).map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("refuses to write to another customer's conversation", async () => {
    const store = createDatabaseConversationStore(createServiceClient());
    const conversation = await store.createConversation(customerA.id, "Owned by A");

    await expect(
      store.appendUserMessage(customerB.id, conversation.id, "Not mine"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      store.appendAssistantMessage(customerB.id, conversation.id, {
        content: "Not mine",
        status: "complete",
        productSkus: [],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(store.findConversation(customerB.id, conversation.id)).resolves.toBeNull();
  });

  it("loads a transcript with cards rebuilt from the current catalog", async () => {
    const conversation = await service
      .from("assistant_conversations")
      .insert(conversationRow(customerA.id, "Card conversation"))
      .select("id")
      .single();

    if (conversation.error) {
      throw conversation.error;
    }

    const inserted = await service.from("assistant_messages").insert({
      conversation_id: conversation.data.id,
      role: "assistant",
      content: "Try AIMEE.",
      status: "interrupted",
      product_skus: ["AIMEE", "MISSING-SKU"],
    });

    if (inserted.error) {
      throw inserted.error;
    }

    selectServiceClient(customerA.client);
    const loaded = await loadMyConversation(conversation.data.id, "vi");

    expect(loaded.ok).toBe(true);

    if (!loaded.ok) {
      return;
    }

    expect(loaded.data.conversation.title).toBe("Card conversation");
    expect(loaded.data.messages).toHaveLength(1);
    expect(loaded.data.messages[0]).toMatchObject({
      role: "assistant",
      content: "Try AIMEE.",
      interrupted: true,
    });
    expect(loaded.data.messages[0]?.cards.map((card) => card.sku)).toEqual(["AIMEE"]);
    expect(loaded.data.messages[0]?.cards[0]).toMatchObject({
      url: "/vi/products/AIMEE",
    });
  });

  it("writes a completed turn through the real conversation repository", async () => {
    const provider: ChatProvider = {
      model: "test-model",
      async *stream() {
        yield { type: "text", text: "Hello from the integration test." };
      },
      async complete() {
        return { text: "Hello.", toolCalls: [], reason: "stop", usage: null };
      },
    };
    const quota: QuotaStore = {
      consume: async () => ({ allowed: true, remainingToday: 9 }),
      status: async () => ({ remainingToday: 9, globalPaused: false }),
    };
    const config: AiConfig = {
      primary: {
        baseUrl: "https://provider.test/v1",
        model: "test-model",
        apiKey: "test-key",
        reasoningEffort: null,
      },
      fallback: null,
      timeoutMs: 1000,
      maxTokens: 100,
      quotas: {
        perUserPerDay: 30,
        perUserPerMinute: 5,
        globalPerDay: 500,
        timeZone: "Asia/Ho_Chi_Minh",
      },
      limits: {
        historyMaxMessages: 10,
        messageMaxChars: 1000,
        historyMaxChars: 8000,
        maxToolRounds: 2,
        maxResponseChars: 1000,
        requestMaxBytes: 65_536,
      },
    };
    const dependencies: ChatDependencies = {
      config: () => config,
      createProvider: () => provider,
      getUser: async () => ({ id: customerA.id }),
      getPrivacyProfile: async () => null,
      quota: () => quota,
      conversations: createDatabaseConversationStore(service),
      catalog: chatDependencies.catalog,
    };

    const response = await handleChatRequest(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: "en",
          conversationId: null,
          message: "A real database question",
        }),
      }),
      dependencies,
    );
    const conversationId = response.headers.get("x-conversation-id");

    expect(response.status).toBe(200);
    expect(conversationId).toBeTruthy();
    expect(await response.text()).toContain("event: done");

    const conversation = await service
      .from("assistant_conversations")
      .select("id, title")
      .eq("id", conversationId!)
      .single();
    const messages = await service
      .from("assistant_messages")
      .select("role, content, status, product_skus")
      .eq("conversation_id", conversationId!)
      .order("created_at", { ascending: true });

    expect(conversation.data?.title).toBe("A real database question");
    expect(messages.data).toEqual([
      { role: "user", content: "A real database question", status: "complete", product_skus: [] },
      {
        role: "assistant",
        content: "Hello from the integration test.",
        status: "complete",
        product_skus: [],
      },
    ]);
  });

  it("stores a failed turn as an empty assistant answer", async () => {
    const provider: ChatProvider = {
      model: "test-model",
      async *stream() {
        throw new Error("provider down");
      },
      async complete() {
        throw new Error("provider down");
      },
    };
    const quota: QuotaStore = {
      consume: async () => ({ allowed: true, remainingToday: 9 }),
      status: async () => ({ remainingToday: 9, globalPaused: false }),
    };
    const config: AiConfig = {
      primary: {
        baseUrl: "https://provider.test/v1",
        model: "test-model",
        apiKey: "test-key",
        reasoningEffort: null,
      },
      fallback: null,
      timeoutMs: 1000,
      maxTokens: 100,
      quotas: {
        perUserPerDay: 30,
        perUserPerMinute: 5,
        globalPerDay: 500,
        timeZone: "Asia/Ho_Chi_Minh",
      },
      limits: {
        historyMaxMessages: 10,
        messageMaxChars: 1000,
        historyMaxChars: 8000,
        maxToolRounds: 2,
        maxResponseChars: 1000,
        requestMaxBytes: 65_536,
      },
    };
    const dependencies: ChatDependencies = {
      config: () => config,
      createProvider: () => provider,
      getUser: async () => ({ id: customerB.id }),
      getPrivacyProfile: async () => null,
      quota: () => quota,
      conversations: createDatabaseConversationStore(service),
      catalog: chatDependencies.catalog,
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleChatRequest(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: "en",
          conversationId: null,
          message: "A question the provider fails",
        }),
      }),
      dependencies,
    );
    const conversationId = response.headers.get("x-conversation-id");

    await response.text();

    const messages = await service
      .from("assistant_messages")
      .select("role, content, status")
      .eq("conversation_id", conversationId!)
      .order("created_at", { ascending: true });

    expect(messages.data?.at(-1)).toEqual({
      role: "assistant",
      content: "",
      status: "failed",
    });
  });

  it("deletes one conversation or all of them only for the owner", async () => {
    const store = createDatabaseConversationStore(service);
    const owned = await store.createConversation(customerA.id, "Delete one");
    const alsoOwned = await store.createConversation(customerA.id, "Delete all");
    const other = await store.createConversation(customerB.id, "Keep this");

    selectServiceClient(customerB.client);
    const rejected = await deleteMyConversation({ id: owned.id });

    expect(rejected).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

    selectServiceClient(customerA.client);
    const deleted = await deleteMyConversation({ id: owned.id });

    expect(deleted.ok).toBe(true);

    const all = await deleteAllMyConversations();

    expect(all.ok).toBe(true);

    if (all.ok) {
      expect(all.data.deleted).toBeGreaterThanOrEqual(2);
    }

    const remaining = await service
      .from("assistant_conversations")
      .select("id")
      .in("id", [owned.id, alsoOwned.id, other.id]);

    expect(remaining.data?.map((row) => row.id)).toEqual([other.id]);

    await service.from("assistant_conversations").delete().eq("id", other.id);
  });
});
