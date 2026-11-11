import { expect, test } from "@playwright/test";

test("favorites survive reload, sync across tabs, and can be removed", async ({
  page,
  context,
}) => {
  await page.goto("/en/shop");
  const save = page.getByRole("button", { name: /^Save .+ to favorites$/ }).first();
  const label = await save.getAttribute("aria-label");
  const name = label!.slice(5, -13);
  await save.click();
  await expect(page.getByRole("link", { name: "Favorites, 1 item", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cart, empty", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/en\/shop$/);

  const second = await context.newPage();
  await second.goto("/vi/favorites");
  await expect(second.getByRole("main").locator("article")).toHaveCount(1);
  await page.getByRole("link", { name: "Favorites, 1 item", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/favorites$/);
  await expect(page.getByRole("main").getByRole("link", { name, exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: `Remove ${name} from favorites`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your favorites start here" })).toBeVisible();
  await expect(second.getByRole("heading", { name: "Lưu những món bạn thích" })).toBeVisible();
});

test("favorites keep the selection after a load error and retry with current catalog data", async ({
  page,
}) => {
  await page.goto("/en/shop");
  await page
    .getByRole("button", { name: /^Save .+ to favorites$/ })
    .first()
    .click();
  let fail = true;
  await page.route("**/api/favorites", async (route) => {
    if (fail) await route.fulfill({ status: 503, json: { error: "INTERNAL" } });
    else await route.continue();
  });
  await page.goto("/en/favorites");
  await expect(page.getByRole("heading", { name: "Could not load your favorites" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Favorites, 1 item", exact: true })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("main").locator("article")).toHaveCount(1);
  const invalid = await page.request.post("/api/favorites", {
    data: { locale: "en", ids: ["invalid"] },
  });
  expect(invalid.status()).toBe(400);
});

test("damaged saved data has a usable empty state", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("coveweft-favorites", "{broken"));
  await page.goto("/en/favorites");
  await expect(page.getByRole("heading", { name: "Your favorites start here" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Browse shop" }).click();
  await expect(page).toHaveURL(/\/en\/shop$/);
});

test("unavailable saved products can be cleared", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "coveweft-favorites",
      JSON.stringify(["a64c4b20-6130-4b85-b3de-0c9b71aa98e0"]),
    ),
  );
  await page.goto("/en/favorites");
  await expect(
    page.getByRole("heading", { name: "These pieces are no longer available" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear favorites", exact: true }).click();
  await expect(page.getByRole("link", { name: "Favorites, empty", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your favorites start here" })).toBeVisible();
});

test("favorites remain usable when storage writes are blocked", async ({ page }) => {
  await page.addInitScript(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "coveweft-favorites") throw new DOMException("Blocked", "QuotaExceededError");
      return write.call(this, key, value);
    };
  });
  await page.goto("/en/shop");
  await page
    .getByRole("button", { name: /^Save .+ to favorites$/ })
    .first()
    .click();
  await page.getByRole("link", { name: "Favorites, 1 item", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/favorites$/);
  await expect(page.getByRole("main").locator("article")).toHaveCount(1);
  await page.getByRole("button", { name: /^Remove .+ from favorites$/ }).click();
  await expect(page.getByRole("heading", { name: "Your favorites start here" })).toBeVisible();
});

test("favorites paginate beyond one grid", async ({ page }) => {
  await page.goto("/en/shop");
  const save = page.getByRole("button", { name: /^Save .+ to favorites$/ });
  for (let i = 0; i < 24; i++) await save.first().click();
  await page.goto("/en/shop?page=2");
  await page
    .getByRole("button", { name: /^Save .+ to favorites$/ })
    .first()
    .click();
  await page.goto("/en/favorites");
  await expect(page.getByRole("main").locator("article")).toHaveCount(24);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("main").locator("article")).toHaveCount(1);
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
});

test("price handles commit on release, keep focus, and follow browser history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/shop");
  const filters = page.getByRole("form", { name: "Filters", exact: true }).first();
  const lower = filters.getByRole("slider", { name: "From", exact: true });
  const upper = filters.getByRole("slider", { name: "To", exact: true });
  const ceiling = Number(await upper.getAttribute("max"));
  expect(ceiling % 100_000).toBe(0);
  await expect(lower).toHaveValue("0");
  await lower.focus();
  await page.keyboard.down("ArrowRight");
  await expect(lower).toHaveValue("1000");
  await expect(page).not.toHaveURL(/min=/);
  await page.keyboard.up("ArrowRight");
  await expect(page).toHaveURL(/min=1000/);
  await expect(lower).toBeFocused();
  await upper.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(new RegExp(`max=${ceiling - 1000}`));
  await expect(upper).toBeFocused();
  await page.goBack();
  await expect(page).not.toHaveURL(/max=/);
  await expect(upper).toHaveValue(String(ceiling));
  await page.goForward();
  await expect(upper).toHaveValue(String(ceiling - 1000));
  await page.goto("/en/shop?q=zzzz-no-such-product");
  await expect(upper).toHaveAttribute("max", String(ceiling));
});

test("both price handles drag without crossing on desktop and mobile", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/en/shop");
    if (width < 1024) await page.getByRole("button", { name: "Filters", exact: true }).click();
    const filters =
      width < 1024 ? page.getByRole("dialog", { name: "Filters" }) : page.locator("aside");
    const lower = filters.getByRole("slider").first();
    const upper = filters.getByRole("slider").last();
    await lower.scrollIntoViewIfNeeded();
    const box = (await lower.boundingBox())!;
    await page.mouse.move(box.x + 12, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(page).toHaveURL(/min=/);
    expect(Number(await lower.inputValue())).toBeGreaterThan(0);
    const upperBox = (await upper.boundingBox())!;
    await page.mouse.move(upperBox.x + upperBox.width - 12, upperBox.y + upperBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(upperBox.x + upperBox.width * 0.6, upperBox.y + upperBox.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    await expect(page).toHaveURL(/max=/);
    expect(Number(await lower.inputValue())).toBeLessThanOrEqual(Number(await upper.inputValue()));
  }
});

test("the home hero keeps its single action in the first viewport with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/en");
    const hero = page.locator("section[aria-labelledby=hero-heading]");
    await expect(hero.getByRole("link", { name: "Browse shop", exact: true })).toBeInViewport();
    await expect(hero.getByRole("link", { name: "See what's new" })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
