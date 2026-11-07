import { expect, test, type Locator, type Page } from "@playwright/test";

// Shopping assistant widget. The chat endpoints are mocked here; the auth and
// purchase flows run against the local Supabase stack.

const DEMO_CUSTOMER = {
  email: process.env.DEMO_CUSTOMER_EMAIL ?? "customer@demo.coveweft.local",
  password: process.env.DEMO_CUSTOMER_PASSWORD ?? "demo-customer-123",
};

const PRODUCT_SKU = "BB25CR";
const PRODUCT_NAME = "Cherry swimsuit";
const PRODUCT_OPTION = "M (3Y)";

const STATUS_READY = {
  configured: true,
  signedIn: true,
  remainingToday: 9,
  globalPaused: false,
};

type ChatStatus = {
  configured: boolean;
  signedIn: boolean;
  remainingToday: number | null;
  globalPaused: boolean;
};

function sseBody(events: Array<{ event: string; data: unknown }>): string {
  return events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
}

async function mockStatus(page: Page, status: ChatStatus = STATUS_READY) {
  await page.route("**/api/chat/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(status),
    }),
  );
}

async function mockChatJson(
  page: Page,
  status: number,
  error: { code: string; details?: unknown },
) {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ error }),
    }),
  );
}

async function mockChatSse(page: Page, body: string) {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body,
    }),
  );
}

async function signIn(page: Page, next = "/shop") {
  await page.goto(`/en/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(DEMO_CUSTOMER.email);
  await page.getByLabel("Password").fill(DEMO_CUSTOMER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/sign-in/);
}

function openButton(page: Page) {
  return page.getByRole("button", { name: "Ask the shopping assistant" });
}

async function openAssistant(page: Page) {
  await openButton(page).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function send(dialog: Locator, question: string) {
  await dialog.getByLabel("Your question").fill(question);
  await dialog.getByRole("button", { name: "Send" }).click();
}

async function chooseOption(page: Page, option = PRODUCT_OPTION) {
  await page.locator("label", { hasText: option }).first().click();
}

test("a visitor sees a sign-in prompt with a return path and cannot send", async ({ page }) => {
  await page.goto("/en/shop?q=cherry");
  const dialog = await openAssistant(page);

  await expect(dialog.getByText("Sign in to chat")).toBeVisible();
  await expect(dialog.getByLabel("Your question")).toHaveCount(0);

  const signInLink = dialog.getByRole("link", { name: "Sign in to continue" });
  await expect(signInLink).toHaveAttribute("href", "/en/sign-in?next=%2Fshop%3Fq%3Dcherry");
  await signInLink.click();
  await expect(page).toHaveURL(/\/en\/sign-in\?next=%2Fshop%3Fq%3Dcherry$/);
});

test("deltas render progressively and product cards link to the product", async ({ page }) => {
  await mockStatus(page);

  await page.addInitScript(
    ({ chunks, delayMs }: { chunks: string[]; delayMs: number }) => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const raw =
          typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
        if (new URL(raw, window.location.href).pathname === "/api/chat") {
          const encoder = new TextEncoder();
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
              headers: { "Content-Type": "text/event-stream" },
            }),
          );
        }
        return originalFetch(input, init);
      };
    },
    {
      delayMs: 900,
      chunks: [
        sseBody([{ event: "delta", data: { text: "Checking the catalog now." } }]),
        sseBody([{ event: "delta", data: { text: " Size M (3Y) is available." } }]),
        sseBody([
          {
            event: "products",
            data: {
              items: [
                {
                  sku: PRODUCT_SKU,
                  name: PRODUCT_NAME,
                  priceVnd: 450000,
                  inStock: true,
                  imageUrl: "http://localhost:3130/media/studio/BB25CR/01-480.webp",
                  url: `/en/products/${PRODUCT_SKU}`,
                },
              ],
            },
          },
        ]),
        sseBody([{ event: "done", data: { remainingToday: 8 } }]),
      ],
    },
  );

  await signIn(page);
  const dialog = await openAssistant(page);

  await send(dialog, "Do you have size M?");
  const log = dialog.getByRole("log");

  await expect(dialog.getByText("Checking the catalog now.")).toBeVisible();
  await expect(dialog.getByText("Size M (3Y) is available.")).toHaveCount(0);
  await expect(log).toHaveAttribute("aria-busy", "true");

  await expect(dialog.getByText("Checking the catalog now. Size M (3Y) is available.")).toBeVisible(
    { timeout: 10_000 },
  );
  await expect(log).toHaveAttribute("aria-busy", "false");

  const card = dialog.getByRole("link", { name: PRODUCT_NAME });
  await expect(card).toHaveAttribute("href", `/en/products/${PRODUCT_SKU}`);
  await expect(dialog.getByText("In stock")).toBeVisible();
  await expect(dialog.getByText("8 questions left today")).toBeVisible();
});

test("answer text is rendered as plain text, never HTML", async ({ page }) => {
  await mockStatus(page);
  await mockChatSse(
    page,
    sseBody([
      {
        event: "delta",
        data: { text: "<b>bold</b> <img src=x onerror=alert(1)>" },
      },
      { event: "done", data: { remainingToday: 7 } },
    ]),
  );

  await signIn(page);
  const dialog = await openAssistant(page);
  await send(dialog, "Show me an answer");

  const log = dialog.getByRole("log");
  await expect(log.getByText("<b>bold</b> <img src=x onerror=alert(1)>")).toBeVisible();
  await expect(log.locator("b")).toHaveCount(0);
  await expect(log.locator("img")).toHaveCount(0);
});

test("a not-configured environment shows its own state", async ({ page }) => {
  await mockStatus(page, { ...STATUS_READY, configured: false, remainingToday: null });
  await signIn(page);

  const dialog = await openAssistant(page);

  await expect(dialog.getByText("The shopping assistant is not available")).toBeVisible();
  await expect(dialog.getByLabel("Your question")).toHaveCount(0);
});

test("an unavailable provider shows a retryable error", async ({ page }) => {
  await mockStatus(page);
  await mockChatSse(
    page,
    sseBody([{ event: "error", data: { code: "AI_UNAVAILABLE", retryable: true } }]),
  );
  await signIn(page);

  const dialog = await openAssistant(page);
  await send(dialog, "Is anyone there?");

  await expect(dialog.getByText("The assistant could not answer")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(dialog.getByLabel("Your question")).toBeVisible();
});

test("a server-side too-long rejection shows the same limit state", async ({ page }) => {
  await mockStatus(page);
  await mockChatJson(page, 413, {
    code: "AI_INPUT_TOO_LONG",
    details: { reason: "question_too_long" },
  });
  await signIn(page);

  const dialog = await openAssistant(page);
  await send(dialog, "A question the server rejects");

  await expect(dialog.getByText("Your question is too long")).toBeVisible();
  await expect(dialog.getByLabel("Your question")).toBeVisible();
});

test("Vietnamese uses its own quota copy", async ({ page }) => {
  await mockStatus(page, { ...STATUS_READY, remainingToday: 0 });
  await signIn(page);
  await page.goto("/vi/shop");
  await page.getByRole("button", { name: "Hỏi trợ lý mua sắm" }).click();
  const dialog = page.getByRole("dialog");

  await expect(dialog.getByText("Bạn đã dùng hết lượt hỏi hôm nay")).toBeVisible();
  await expect(dialog.getByLabel("Câu hỏi của bạn")).toHaveCount(0);
});

test("the daily quota state disables the composer", async ({ page }) => {
  await mockStatus(page);
  await mockChatJson(page, 429, {
    code: "AI_QUOTA_USER_DAY",
    details: { remainingToday: 0 },
  });
  await signIn(page);

  const dialog = await openAssistant(page);
  await send(dialog, "One more question");

  await expect(dialog.getByText("You have used all of today's questions")).toBeVisible();
  await expect(dialog.getByLabel("Your question")).toHaveCount(0);
});

test("the per-minute quota state keeps the composer and explains the wait", async ({ page }) => {
  await mockStatus(page);
  await mockChatJson(page, 429, { code: "AI_QUOTA_USER_MINUTE" });
  await signIn(page);

  const dialog = await openAssistant(page);
  await send(dialog, "First question");

  await expect(dialog.getByText("You are asking too quickly")).toBeVisible();
  await expect(dialog.getByLabel("Your question")).toBeVisible();
});

test("the global quota state pauses the assistant", async ({ page }) => {
  await mockStatus(page);
  await mockChatJson(page, 429, { code: "AI_QUOTA_GLOBAL" });
  await signIn(page);

  const dialog = await openAssistant(page);
  await send(dialog, "Any question");

  await expect(dialog.getByText("The shopping assistant is paused")).toBeVisible();
  await expect(dialog.getByLabel("Your question")).toHaveCount(0);
});

test("a transient failure offers a retry that can succeed", async ({ page }) => {
  await mockStatus(page);
  let calls = 0;
  await page.route("**/api/chat", (route) => {
    calls += 1;
    if (calls === 1) {
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "INTERNAL" } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: sseBody([
        { event: "delta", data: { text: "Here is the answer." } },
        { event: "done", data: { remainingToday: 6 } },
      ]),
    });
  });

  await signIn(page);
  const dialog = await openAssistant(page);
  await send(dialog, "Can you retry?");

  await expect(dialog.getByText("The assistant could not answer")).toBeVisible();
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.getByText("Here is the answer.")).toBeVisible();
  await expect(calls).toBe(2);
});

test("an interrupted stream keeps the partial answer and marks it incomplete", async ({ page }) => {
  await mockStatus(page);
  await mockChatSse(
    page,
    sseBody([
      { event: "delta", data: { text: "The first half of the answer" } },
      { event: "error", data: { code: "AI_STREAM_INTERRUPTED", retryable: true } },
    ]),
  );
  await signIn(page);

  const dialog = await openAssistant(page);
  await send(dialog, "A long question");

  await expect(dialog.getByText("The first half of the answer")).toBeVisible();
  await expect(dialog.getByText("Answer incomplete")).toBeVisible();
  await expect(dialog.getByText("The answer was interrupted")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("a question over the limit never reaches the API", async ({ page }) => {
  await mockStatus(page);
  let calls = 0;
  await page.route("**/api/chat", (route) => {
    calls += 1;
    return route.fulfill({ status: 500, body: "" });
  });
  await signIn(page);

  const dialog = await openAssistant(page);
  await dialog.getByLabel("Your question").fill("a".repeat(1001));

  await expect(dialog.getByText("Your question is too long")).toBeVisible();
  await expect(dialog.getByText("1001 of 1000 characters")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect(calls).toBe(0);
});

test("closing with Escape returns focus to the launcher", async ({ page }) => {
  await mockStatus(page);
  await signIn(page);

  const trigger = openButton(page);
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press("Tab");
  }
  const focusInside = await page.evaluate(
    () => document.querySelector("dialog[open]")?.contains(document.activeElement) ?? false,
  );
  expect(focusInside).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("signing out clears the stored conversation", async ({ page }) => {
  await mockStatus(page);
  await mockChatSse(
    page,
    sseBody([
      { event: "delta", data: { text: "A stored answer." } },
      { event: "done", data: { remainingToday: 5 } },
    ]),
  );
  await signIn(page);

  let dialog = await openAssistant(page);
  await send(dialog, "A stored question");
  await expect(dialog.getByText("A stored answer.")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  dialog = await openAssistant(page);
  await expect(dialog.getByText("A stored question")).toBeVisible();
  await expect(dialog.getByText("A stored answer.")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/en/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/en$/);
  expect(
    await page.evaluate(() =>
      Object.keys(window.sessionStorage).filter((key) => key.includes("assistant")),
    ),
  ).toEqual([]);

  dialog = await openAssistant(page);
  await expect(dialog.getByText("A stored question")).toHaveCount(0);
  await expect(dialog.getByText("Sign in to chat")).toBeVisible();
});

test("the mobile launcher does not cover the fixed buy button", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/en/products/${PRODUCT_SKU}`);
  await chooseOption(page);
  await page.getByRole("button", { name: "Add to cart" }).first().scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 1200);

  const buyBar = page.locator("div.fixed.inset-x-0.bottom-0");
  await expect(buyBar).toBeInViewport();

  const barBox = await buyBar.boundingBox();
  const launcherBox = await openButton(page).boundingBox();

  expect(barBox).not.toBeNull();
  expect(launcherBox).not.toBeNull();
  expect(barBox!.y).toBeLessThan(844);
  expect(launcherBox!.y + launcherBox!.height).toBeLessThanOrEqual(barBox!.y);

  const dialog = await openAssistant(page);
  await expect(dialog.getByText("Sign in to chat")).toBeVisible();
});

test("checkout still works while both chat endpoints fail", async ({ page }) => {
  await page.route("**/api/chat/status", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/chat", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
  );

  await page.goto("/en/sign-up?next=%2Fshop");
  await page.getByLabel("Full name").fill("Lan Nguyen Test");
  await page
    .getByLabel("Email")
    .fill(
      `e2e-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@demo.coveweft.local`,
    );
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByLabel(/I have read and agree/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).not.toHaveURL(/sign-up/);

  await page.goto(`/en/products/${PRODUCT_SKU}`);
  await chooseOption(page);
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await expect(page.getByText(`${PRODUCT_NAME} was added to your cart.`)).toBeVisible();

  const dialog = await openAssistant(page);
  await send(dialog, "Is chat working?");
  await expect(dialog.getByText("The assistant could not answer")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/en/checkout");
  await page.getByLabel("Recipient name").fill("Lan Nguyen Test");
  await page.getByLabel("Phone number").fill("0901 234 567");
  await page.getByLabel("Delivery address").fill("12 Test Street, District 1, Ho Chi Minh City");
  await page.getByRole("radio", { name: "Cash on delivery" }).check();
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page).toHaveURL(/\/en\/checkout\/confirmation\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Thank you, your order is placed",
  );
});
