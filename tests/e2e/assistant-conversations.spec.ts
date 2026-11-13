import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

// Assistant page and conversation rail against the local Supabase stack. The
// chat endpoint is mocked, so no provider key or credit is used.

function envFile(): Record<string, string> {
  const values: Record<string, string> = {};

  try {
    const contents = readFileSync(join(process.cwd(), ".env.local"), "utf8");

    for (const line of contents.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());

      if (match) {
        values[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // The local stack is required; the tests below skip without it.
  }

  return values;
}

const localEnv = envFile();
const supabaseUrl =
  process.env.SUPABASE_URL_INTERNAL ?? localEnv.SUPABASE_URL_INTERNAL ?? "http://127.0.0.1:54321";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? localEnv.SUPABASE_SECRET_KEY;
const admin = createClient(supabaseUrl, secretKey ?? "missing-key", {
  auth: { autoRefreshToken: false, persistSession: false },
});

test.skip(!secretKey, "Set SUPABASE_SECRET_KEY or run the local Supabase stack.");

let accountSequence = 0;
let accountToDelete: Account | null = null;

type Account = { id: string; email: string; password: string };

async function createAccount(): Promise<Account> {
  accountSequence += 1;
  const email = `e2e-assistant-${Date.now()}-${process.pid}-${accountSequence}@example.com`;
  const password = "e2e-password-123";
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "E2E Assistant", privacy_policy_version: "2026-11-14" },
  });

  if (created.error || !created.data.user) {
    throw created.error ?? new Error("No user returned.");
  }

  const account = { id: created.data.user.id, email, password };
  accountToDelete = account;

  return account;
}

async function signIn(page: Page, account: Account, next = "/shop") {
  await page.goto(`/en/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/sign-in/);
}

type SeedMessage = {
  role: "user" | "assistant";
  content: string;
  status?: "complete" | "interrupted" | "failed";
  productSkus?: string[];
};

async function seedConversation(
  userId: string,
  title: string,
  messages: SeedMessage[],
): Promise<string> {
  const conversation = await admin
    .from("assistant_conversations")
    .insert({ user_id: userId, title })
    .select("id")
    .single();

  if (conversation.error) {
    throw conversation.error;
  }

  if (messages.length > 0) {
    const inserted = await admin.from("assistant_messages").insert(
      messages.map((message, index) => ({
        conversation_id: conversation.data.id,
        role: message.role,
        content: message.content,
        status: message.status ?? "complete",
        product_skus: message.productSkus ?? [],
        created_at: new Date(Date.now() + index).toISOString(),
      })),
    );

    if (inserted.error) {
      throw inserted.error;
    }
  }

  return conversation.data.id as string;
}

async function mockStatus(page: Page) {
  await page.route("**/api/chat/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        signedIn: true,
        remainingToday: 5,
        globalPaused: false,
      }),
    }),
  );
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function mockStreamingChat(
  page: Page,
  conversationId: string,
  chunks: string[],
  delayMs = 700,
) {
  await page.addInitScript(
    ({
      conversationId,
      chunks,
      delayMs,
    }: {
      conversationId: string;
      chunks: string[];
      delayMs: number;
    }) => {
      const originalFetch = window.fetch.bind(window);
      const encoder = new TextEncoder();
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const raw =
          typeof input === "string" ? input : input instanceof Request ? input.url : String(input);

        if (new URL(raw, window.location.href).pathname !== "/api/chat") {
          return originalFetch(input, init);
        }

        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            for (const chunk of chunks) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        });

        return Promise.resolve(
          new Response(body, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              "X-Conversation-Id": conversationId,
            },
          }),
        );
      };
    },
    { conversationId, chunks, delayMs },
  );
}

async function openPanel(page: Page) {
  await page.getByRole("button", { name: "Ask the shopping assistant" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(async () => {
  if (accountToDelete) {
    await admin.auth.admin.deleteUser(accountToDelete.id);
    accountToDelete = null;
  }
});

test("Expand keeps a running answer and opens its conversation URL", async ({ page }) => {
  const account = await createAccount();
  const conversationId = await seedConversation(account.id, "Size question", [
    { role: "user", content: "Do you have size M?" },
  ]);
  await mockStatus(page);
  await mockStreamingChat(page, conversationId, [
    sse("delta", { text: "Size M is in stock." }),
    sse("delta", { text: " It also fits 160 cm." }),
    sse("done", { remainingToday: 4, conversationId }),
  ]);
  await signIn(page, account);

  const dialog = await openPanel(page);
  await dialog.getByLabel("Your question").fill("Do you have size M?");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText("Size M is in stock.")).toBeVisible();

  await dialog.getByRole("button", { name: "Open full page" }).click();

  await expect(page).toHaveURL(new RegExp(`/en/assistant/${conversationId}$`));
  await expect(page.getByRole("button", { name: "Ask the shopping assistant" })).toHaveCount(0);
  await expect(page.getByText("Size M is in stock. It also fits 160 cm.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Answer incomplete")).toHaveCount(0);
});

test("the Assistant nav opens the page and the rail opens a saved conversation", async ({
  page,
}) => {
  const account = await createAccount();
  const conversationA = await seedConversation(account.id, "Lap swimming", [
    { role: "user", content: "Which swimsuit is good for laps?" },
    {
      role: "assistant",
      content: "Try the Ocean Racer swimsuit.",
      productSkus: ["AIMEE"],
    },
  ]);
  await seedConversation(account.id, "Kids rash guards", [
    { role: "user", content: "Show me rash guards for kids." },
  ]);
  await mockStatus(page);
  await signIn(page, account);
  await page.goto("/en/shop");

  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Assistant" })
    .click();

  await expect(page).toHaveURL(/\/en\/assistant$/);
  await expect(page.getByRole("button", { name: /^Lap swimming/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Kids rash guards/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask the shopping assistant" })).toHaveCount(0);

  await page.getByRole("button", { name: /^Lap swimming/ }).click();

  await expect(page).toHaveURL(new RegExp(`/en/assistant/${conversationA}$`));
  await expect(page.getByText("Which swimsuit is good for laps?")).toBeVisible();
  await expect(page.getByText("Try the Ocean Racer swimsuit.")).toBeVisible();
  await expect(page.locator(`a[href="/en/products/AIMEE"]`)).toBeVisible();
});

test("a saved interrupted answer keeps its partial text", async ({ page }) => {
  const account = await createAccount();
  const conversationId = await seedConversation(account.id, "Interrupted answer", [
    { role: "user", content: "A long question" },
    {
      role: "assistant",
      content: "The first half of the answer",
      status: "interrupted",
    },
  ]);
  await mockStatus(page);
  await signIn(page, account);

  await page.goto(`/en/assistant/${conversationId}`);

  await expect(page.getByText("The first half of the answer")).toBeVisible();
  await expect(page.getByText("Answer incomplete")).toBeVisible();
});

test("a saved conversation continues instead of starting a new one", async ({ page }) => {
  const account = await createAccount();
  const conversationId = await seedConversation(account.id, "Continue this", [
    { role: "user", content: "First question" },
    { role: "assistant", content: "First answer" },
  ]);
  await mockStatus(page);
  let sent: { conversationId?: string | null; message?: string } | null = null;
  await page.route("**/api/chat", async (route) => {
    sent = route.request().postDataJSON() as typeof sent;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body:
        sse("delta", { text: "Second answer." }) +
        sse("done", { remainingToday: 4, conversationId }),
    });
  });
  await signIn(page, account);
  await page.goto(`/en/assistant/${conversationId}`);
  await expect(page.getByText("First answer")).toBeVisible();

  await page.getByLabel("Your question").fill("Follow-up question");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Second answer.")).toBeVisible();

  expect(sent).toMatchObject({ conversationId, message: "Follow-up question" });
});

test("deleting one conversation and then all of them updates the rail and the database", async ({
  page,
}) => {
  const account = await createAccount();
  const first = await seedConversation(account.id, "Conversation A", [
    { role: "user", content: "First question" },
  ]);
  await seedConversation(account.id, "Conversation B", [
    { role: "user", content: "Second question" },
  ]);
  await mockStatus(page);
  await signIn(page, account, "/assistant");

  await expect(page.getByRole("button", { name: "Conversation A" })).toBeVisible();
  await page
    .locator("li", { hasText: "Conversation A" })
    .getByRole("button", { name: "Delete conversation" })
    .click();

  let dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Delete this conversation?")).toBeVisible();
  await dialog.getByRole("button", { name: "Delete conversation" }).click();
  await expect(page.getByRole("button", { name: "Conversation A" })).toHaveCount(0);

  const afterOne = await admin
    .from("assistant_conversations")
    .select("id")
    .eq("user_id", account.id);
  expect(afterOne.data?.map((row) => row.id)).not.toContain(first);

  await page.getByRole("button", { name: "Delete all conversations" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Delete all conversations?")).toBeVisible();
  await dialog.getByRole("button", { name: "Delete all conversations" }).click();

  await expect(page.getByText("No conversations yet. Ask a question to start one.")).toBeVisible();

  const afterAll = await admin
    .from("assistant_conversations")
    .select("id")
    .eq("user_id", account.id);
  expect(afterAll.data).toEqual([]);
});

test("a visitor sees the sign-in gate without a rail or composer", async ({ page }) => {
  await page.goto("/en/assistant");

  await expect(page.getByText("Sign in to chat")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in to continue" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conversations" })).toHaveCount(0);
  await expect(page.getByLabel("Your question")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask the shopping assistant" })).toHaveCount(0);
});
