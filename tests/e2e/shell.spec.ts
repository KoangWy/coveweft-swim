import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile", width: 360, height: 780 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const POLICY_PATHS = [
  "/about",
  "/policies/shipping",
  "/policies/payment",
  "/policies/returns",
  "/policies/contact",
  "/policies/privacy",
  "/policies/terms",
];

for (const viewport of VIEWPORTS) {
  test.describe(`shell at ${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const path of ["/en", "/vi/policies/privacy"]) {
      test(`${path} fits the viewport and keeps the demo banner visible`, async ({ page }) => {
        await page.goto(path);

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);

        const banner = page.getByText(/Study project|Dự án học tập/);
        await expect(banner).toBeInViewport();

        await page.mouse.wheel(0, 2000);
        await expect(banner).toBeInViewport();
      });
    }
  });
}

test("the locale switch keeps the current page and query", async ({ page }) => {
  await page.goto("/en/policies/shipping?ref=footer");

  await page
    .getByRole("group", { name: "Language" })
    .first()
    .getByRole("link", { name: "Tiếng Việt" })
    .click();

  await expect(page).toHaveURL(/\/vi\/policies\/shipping\?ref=footer$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Giao hàng");
});

test("pages render in the URL language without cookies", async ({ request }) => {
  const response = await request.get("/vi/policies/privacy", { headers: { cookie: "" } });

  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('<html lang="vi"');
  expect(html).toContain("Phiên bản chính sách");
});

test("the footer links to every store policy page", async ({ page }) => {
  await page.goto("/en");
  const footer = page.getByRole("contentinfo");

  for (const path of POLICY_PATHS) {
    await expect(footer.locator(`a[href="/en${path}"]`)).toHaveCount(1);
  }
});

for (const locale of ["en", "vi"]) {
  test(`every policy page renders in ${locale}`, async ({ page }) => {
    for (const path of POLICY_PATHS) {
      const response = await page.goto(`/${locale}${path}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });
}

test("the shipping page shows the fees from store settings", async ({ page }) => {
  await page.goto("/en/policies/shipping");
  const table = page.getByRole("table");

  await expect(table.getByRole("row", { name: /Standard/ })).toContainText("30,000");
  await expect(table.getByRole("row", { name: /Express/ })).toContainText("50,000");
  await expect(page.getByRole("region", { name: "Free Standard shipping" })).toContainText(
    "500,000 or more",
  );
});

test("unknown pages return a localized 404 inside the shell", async ({ page }) => {
  const response = await page.goto("/vi/khong-co-trang-nay");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không tìm thấy trang");
  await expect(page.getByText("Dự án học tập")).toBeVisible();
});

test.describe("mobile navigation", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test("the menu drawer opens, traps Escape, and returns focus", async ({ page }) => {
    await page.goto("/en");
    const trigger = page.getByRole("button", { name: "Open menu" });

    await trigger.click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Women" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test("the skip link moves focus to the main content", async ({ page }) => {
  await page.goto("/en/about");

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");

  await expect(page).toHaveURL(/#main$/);
});

test("the admin area uses its own frame without the storefront header", async ({ page }) => {
  await page.goto("/en/admin");

  await expect(page.getByRole("navigation", { name: "Admin navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Overview" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("search")).toHaveCount(0);
});
