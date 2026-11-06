import { expect, test } from "@playwright/test";

test("redirects the root path to the default locale", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/en$/);
});

test("renders the English home page", async ({ page }) => {
  await page.goto("/en");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("COVEWEFT Swim");
  await expect(page.getByText("Find your water.")).toBeVisible();
});

test("renders the Vietnamese home page", async ({ page }) => {
  await page.goto("/vi");

  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("COVEWEFT Swim");
  await expect(page.getByText("Find your water.")).toBeVisible();
});
