import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

// Live assistant check. It calls the configured provider and spends API
// credit, so it only runs when AI_LIVE_SMOKE=1 is set.
test.skip(process.env.AI_LIVE_SMOKE !== "1", "Set AI_LIVE_SMOKE=1 to call the real provider.");

// A taller viewport fits a full answer, its product card, and the composer.
test.use({ viewport: { width: 1440, height: 1000 } });

const SHOTS_DIR =
  process.env.ASSISTANT_SHOTS_DIR ?? join(process.cwd(), "test-results", "assistant-shots");

const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

test("answers a Vietnamese and an English question in the matching language", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(SHOTS_DIR, { recursive: true });

  const email = process.env.DEMO_CUSTOMER_EMAIL ?? "customer@demo.coveweft.local";
  const password = process.env.DEMO_CUSTOMER_PASSWORD ?? "demo-customer-123";

  await page.goto("/en/sign-in?next=%2Fshop");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/sign-in/);

  await page.goto("/vi/shop");
  await page.getByRole("button", { name: "Hỏi trợ lý mua sắm" }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Câu hỏi của bạn")).toBeVisible();
  let log = dialog.getByRole("log");

  await dialog
    .getByLabel("Câu hỏi của bạn")
    .fill("Bạn còn size M (3Y) cho mẫu Cherry swimsuit (BB25CR) không?");
  await dialog.getByRole("button", { name: "Gửi" }).click();
  await expect(log).toHaveAttribute("aria-busy", "true");
  await expect(log).toHaveAttribute("aria-busy", "false", { timeout: 120_000 });

  const vietnameseAnswer = dialog
    .getByRole("article", { name: "Trợ lý" })
    .last()
    .locator("div.whitespace-pre-wrap");
  const vietnameseText = await vietnameseAnswer.innerText();
  expect(vietnameseText.length).toBeGreaterThan(10);
  expect(vietnameseText).toMatch(VIETNAMESE);
  await log.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: join(SHOTS_DIR, "assistant-vi.png") });

  await page.goto("/en/shop");
  await page.getByRole("button", { name: "Ask the shopping assistant" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Your question")).toBeVisible();
  log = dialog.getByRole("log");

  await dialog
    .getByLabel("Your question")
    .fill("Do you have size M (3Y) in stock for the Cherry swimsuit (BB25CR)?");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(log).toHaveAttribute("aria-busy", "true");
  await expect(log).toHaveAttribute("aria-busy", "false", { timeout: 120_000 });

  const englishAnswer = dialog
    .getByRole("article", { name: "Assistant" })
    .last()
    .locator("div.whitespace-pre-wrap");
  const englishText = await englishAnswer.innerText();
  expect(englishText.length).toBeGreaterThan(10);
  expect(englishText).not.toMatch(VIETNAMESE);
  await log.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: join(SHOTS_DIR, "assistant-en.png") });
});
