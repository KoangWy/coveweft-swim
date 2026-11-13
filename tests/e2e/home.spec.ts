import { expect, test } from "@playwright/test";

test("redirects the root path to the default locale", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/en$/);
});

test.describe("root redirect with a Vietnamese Accept-Language", () => {
  test.use({ extraHTTPHeaders: { "Accept-Language": "vi" } });

  test("redirects / to /en instead of negotiating a locale", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test("renders the English home page", async ({ page }) => {
  await page.goto("/en");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find your water.");
  await expect(page.getByRole("link", { name: "Browse shop" })).toBeVisible();
});

test("renders the Vietnamese home page", async ({ page }) => {
  await page.goto("/vi");

  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find your water.");
  await expect(page.getByRole("link", { name: "Xem cửa hàng" })).toBeVisible();
});
