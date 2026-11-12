import { expect, test } from "@playwright/test";

test("the header search previews matching products while typing", async ({ page }) => {
  await page.goto("/en/shop");

  const input = page.getByRole("combobox", { name: "Search products" });
  await input.fill("set");

  const suggestions = page.getByRole("listbox", { name: "Search suggestions" });
  await expect(suggestions).toBeVisible();
  await expect(suggestions.getByRole("option").first()).toContainText(/set/i);
  await expect(suggestions.getByRole("option", { name: /See all \d+ results/ })).toBeVisible();

  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", /-option-0$/);
  await input.press("Enter");

  await expect(page).toHaveURL(/\/en\/products\/[A-Za-z0-9-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/set/i);
});

test("Escape closes the suggestion panel and Enter runs the search", async ({ page }) => {
  await page.goto("/en/shop");

  const input = page.getByRole("combobox", { name: "Search products" });
  await input.fill("bikini");
  await expect(page.getByRole("listbox", { name: "Search suggestions" })).toBeVisible();

  await input.press("Escape");
  await expect(page.getByRole("listbox", { name: "Search suggestions" })).toBeHidden();

  await input.press("Enter");
  await expect(page).toHaveURL(/\/en\/shop\?q=bikini$/);
  await expect(page.getByRole("link", { name: "Search: bikini" })).toBeVisible();
});
