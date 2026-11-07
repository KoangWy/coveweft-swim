import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

// Administrator and storefront flows against the local Supabase stack. The
// catalog product used here is not part of the storefront purchase spec, so
// hiding it does not disturb those tests.

const ADMIN = {
  email: process.env.DEMO_ADMIN_EMAIL ?? "admin@demo.coveweft.local",
  password: process.env.DEMO_ADMIN_PASSWORD ?? "demo-admin-123",
};

const DEMO_CUSTOMER = {
  email: process.env.DEMO_CUSTOMER_EMAIL ?? "customer@demo.coveweft.local",
  password: process.env.DEMO_CUSTOMER_PASSWORD ?? "demo-customer-123",
};

const PRODUCT_SKU = "GGAE";
const PRODUCT_NAME = "Gorgeous Aero rash guard";
const ORDER_SKU = "BB25CR";
const ORDER_OPTION = "M (3Y)";
const UPLOAD_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC",
  "base64",
);

function uniqueEmail() {
  return `admin-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@demo.coveweft.local`;
}

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
}

async function signIn(page: Page, email: string, password: string, next = "/admin") {
  await page.goto(`/en/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signOut(page: Page) {
  await page.goto("/en/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/en$/);
}

async function signUpCustomer(page: Page) {
  await page.goto("/en/sign-up?next=%2Faccount");
  await page.getByLabel("Full name").fill("Admin Flow Customer");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByLabel(/I have read and agree/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).not.toHaveURL(/sign-up/);
}

async function addToCartWithRetry(page: Page) {
  const button = page.getByRole("button", { name: "Add to cart" });
  const success = page.getByText(/was added to your cart/);
  const failure = page.getByText("Something went wrong. Please try again.");

  await button.click();
  try {
    await success.waitFor({ state: "visible", timeout: 8000 });
    return;
  } catch {
    // The storefront action can lose a race under a heavily parallel run;
    // retry once when the panel reports the generic failure.
  }

  if (await failure.isVisible().catch(() => false)) {
    await button.click();
  }
  await expect(success).toBeVisible();
}

async function placeCodOrder(page: Page, recipientName: string) {
  await page.goto(`/en/products/${ORDER_SKU}`);
  await page.locator("label", { hasText: ORDER_OPTION }).first().click();
  await expect(page.getByRole("radio", { name: /M \(3Y\) In stock/ })).toBeChecked();
  await addToCartWithRetry(page);
  await page.goto("/en/checkout");
  await page.getByLabel("Recipient name").fill(recipientName);
  await page.getByLabel("Phone number").fill("0909 123 456");
  await page.getByLabel("Delivery address").fill("12 Admin Test Street, District 1");
  await page.getByRole("radio", { name: "Cash on delivery" }).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/en\/checkout\/confirmation\//);

  const totalText = await page.locator("main dd").filter({ hasText: "₫" }).last().innerText();
  const total = Number(totalText.replace(/[^\d]/g, ""));
  const href = await page.getByRole("link", { name: "View order" }).getAttribute("href");
  const orderId = new URL(href ?? "", page.url()).pathname.split("/").pop() ?? "";

  expect(orderId).toMatch(/^[0-9a-f-]{36}$/);
  expect(total).toBeGreaterThan(0);

  return { orderId, total };
}

async function dashboardRevenue(page: Page) {
  await page.goto("/en/admin");
  const card = page.locator("li").filter({ has: page.getByText("Demo revenue", { exact: true }) });
  const text = await card.innerText();

  return Number(text.replace(/[^\d]/g, ""));
}

async function productImageCount(page: Page) {
  return page.locator('section[aria-labelledby="admin-product-images"] ul li').count();
}

async function galleryTotal(page: Page) {
  const text = await page
    .locator('section[aria-label="Product images"] p[aria-live="polite"]')
    .first()
    .innerText();
  const match = /(\d+)$/.exec(text.trim());

  return match ? Number(match[1]) : 0;
}

async function anonymousContext(browser: Browser) {
  return browser.newContext();
}

/** Clicks a control again if a client refresh left it before hydration. */
async function clickUntil(page: Page, trigger: Locator, result: Locator) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await trigger.click();
    try {
      await result.waitFor({ state: "visible", timeout: 1500 });
      return;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  await expect(result).toBeVisible();
}

test.describe("admin", () => {
  test.setTimeout(180_000);

  test("hides a product, edits stock and images, and completes a COD order", async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    // The customer places a COD order first, then hands the browser to the
    // administrator.
    await signUpCustomer(page);
    const recipientName = `Admin Flow ${Date.now()}`;
    const order = await placeCodOrder(page, recipientName);
    await signOut(page);

    await signIn(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL(/\/en\/admin$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overview");
    const revenueBefore = await dashboardRevenue(page);

    // Open the editor and make sure a previous run did not leave it hidden.
    await page.goto(`/en/admin/products?q=${PRODUCT_SKU}`);
    await expect(page.getByRole("link", { name: PRODUCT_NAME }).first()).toBeVisible();
    await page.getByRole("link", { name: "Edit" }).first().click();
    await expect(page).toHaveURL(/\/en\/admin\/products\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(PRODUCT_NAME);
    await settle(page);

    const showButton = page.getByRole("button", { name: "Show", exact: true });
    if ((await showButton.count()) > 0) {
      await showButton.first().click();
      await expect(page.getByText(/back on the storefront/)).toBeVisible();
    }

    const anon = await anonymousContext(browser);
    const anonPage = await anon.newPage();
    await anonPage.goto(`/en/products/${PRODUCT_SKU}`);
    await expect(anonPage.getByRole("heading", { level: 1 })).toHaveText(PRODUCT_NAME);
    const galleryBefore = await galleryTotal(anonPage);
    expect(galleryBefore).toBeGreaterThan(0);

    // Upload an image and check that the storefront gallery grows.
    const fileInput = page.getByLabel("Image file");
    const uploadButton = page.getByRole("button", { name: "Upload image" });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await fileInput.setInputFiles({
        name: "admin-e2e.png",
        mimeType: "image/png",
        buffer: UPLOAD_BYTES,
      });
      if (await uploadButton.isEnabled()) {
        break;
      }
      await page.waitForTimeout(500);
    }
    await expect(uploadButton).toBeEnabled();
    const imagesBefore = await productImageCount(page);
    await uploadButton.click();
    await expect(page.getByText("Image uploaded.")).toBeVisible({ timeout: 15000 });
    await expect.poll(() => productImageCount(page)).toBe(imagesBefore + 1);

    await anonPage.reload();
    const galleryAfter = await galleryTotal(anonPage);
    expect(galleryAfter).toBe(galleryBefore + 1);
    await anon.close();

    // Reorder the gallery and hide a release image instead of deleting it.
    const imagesSection = page.locator('section[aria-labelledby="admin-product-images"]');
    await imagesSection
      .locator("li")
      .first()
      .getByRole("button", { name: "Move image down" })
      .click();
    await expect(page.getByText("Image order saved.")).toBeVisible({ timeout: 15000 });
    const releaseCard = imagesSection
      .locator("li")
      .filter({ hasText: "Studio release" })
      .filter({ hasNotText: "Hidden" })
      .first();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await releaseCard.getByRole("button", { name: "Hide", exact: true }).click();
      try {
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Hide image" })
          .click({ timeout: 1500 });
        break;
      } catch {
        await page.waitForTimeout(500);
      }
    }
    await expect(page.getByText("Image hidden.")).toBeVisible({ timeout: 15000 });

    // Hide the product from the storefront.
    await clickUntil(
      page,
      page.getByRole("button", { name: "Hide", exact: true }).first(),
      page.getByText(/is hidden from the storefront/),
    );

    const hiddenContext = await anonymousContext(browser);
    const hiddenPage = await hiddenContext.newPage();
    const hiddenResponse = await hiddenPage.goto(`/en/products/${PRODUCT_SKU}`);
    expect(hiddenResponse?.status()).toBe(404);
    await hiddenPage.goto(`/en/shop?q=${PRODUCT_SKU}`);
    await expect(hiddenPage.getByRole("link", { name: PRODUCT_NAME })).toHaveCount(0);
    await hiddenContext.close();

    // Adjust the first variant's stock with a reason.
    await page.getByRole("button", { name: "Adjust stock" }).first().click();
    const stockDialog = page.getByRole("dialog");
    await expect(stockDialog.getByRole("heading")).toContainText("Adjust stock");
    await stockDialog.getByLabel("New stock").fill("333");
    await stockDialog.getByLabel("Reason").fill("E2E stock count");
    await stockDialog.getByRole("button", { name: "Save stock" }).click();
    await expect(page.getByText(/is now 333/)).toBeVisible({ timeout: 15000 });

    // Confirm, ship, and deliver the COD order.
    await page.goto(`/en/admin/orders/${order.orderId}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Order ");
    await expect(page.getByText("Order: Pending").first()).toBeVisible();
    await page.getByRole("button", { name: "Confirm order" }).click();
    await expect(page.getByText("Order: Confirmed").first()).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Ship order" }).click();
    await expect(page.getByText("Order: Shipping").first()).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Mark delivered" }).click();
    await expect(page.getByText("Order: Delivered").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Payment: Paid").first()).toBeVisible({ timeout: 15000 });

    // The dashboard revenue counts delivered, paid orders only.
    const revenueAfter = await dashboardRevenue(page);
    expect(revenueAfter).toBe(revenueBefore + order.total);

    // The delivered order appears under the matching filters.
    await page.goto("/en/admin/orders?status=delivered&paymentMethod=cod");
    await expect(page.getByText(recipientName).first()).toBeVisible();
  });

  test("saves product details and translations", async ({ page, browser }) => {
    await signIn(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL(/\/en\/admin$/);

    await page.goto("/en/admin/products?q=MNV");
    await page.getByRole("link", { name: "Edit" }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Navy rash guard");

    const description = `Demo editor description ${Date.now()}`;
    await page.getByLabel("Description (English)").fill(description);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Product saved.").first()).toBeVisible({ timeout: 15000 });

    const anon = await anonymousContext(browser);
    const anonPage = await anon.newPage();
    await anonPage.goto("/en/products/MNV");
    await expect(anonPage.getByText(description)).toBeVisible();
    await anon.close();
  });

  test("asks before cancelling an order", async ({ page }) => {
    await signUpCustomer(page);
    const order = await placeCodOrder(page, `Cancel Flow ${Date.now()}`);
    await signOut(page);

    await signIn(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL(/\/en\/admin$/);
    await page.goto(`/en/admin/orders/${order.orderId}`);
    await expect(page.getByText("Order: Pending").first()).toBeVisible();

    await page.getByRole("button", { name: "Cancel order" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Keep order" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Order: Pending").first()).toBeVisible();

    await page.getByRole("button", { name: "Cancel order" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel order" }).click();
    await expect(page.getByText("Order: Cancelled").first()).toBeVisible({ timeout: 15000 });
  });

  test("visitors and customers are blocked at the server", async ({ page }) => {
    const visitorResponse = await page.request.get("/en/admin", { maxRedirects: 0 });
    expect(visitorResponse.status()).toBeGreaterThanOrEqual(300);
    expect(visitorResponse.status()).toBeLessThan(400);
    expect(visitorResponse.headers()["location"]).toBe("/en/sign-in?next=%2Fadmin");

    await page.goto("/en/sign-in?next=%2Fadmin");
    await expect(page).not.toHaveURL(/\/admin$/);
    await signIn(page, DEMO_CUSTOMER.email, DEMO_CUSTOMER.password);
    await expect(page).toHaveURL(/\/en\/account$/);

    const customerResponse = await page.request.get("/en/admin/orders", { maxRedirects: 0 });
    expect(customerResponse.status()).toBeGreaterThanOrEqual(300);
    expect(customerResponse.status()).toBeLessThan(400);
    expect(customerResponse.headers()["location"]).toBe("/en/account");
  });

  test("renders the admin area in Vietnamese", async ({ page }) => {
    await page.goto("/vi/sign-in?next=%2Fadmin");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Mật khẩu").fill(ADMIN.password);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).toHaveURL(/\/vi\/admin$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tổng quan");
    await expect(page.getByText("Dữ liệu demo")).toBeVisible();

    await page.goto("/vi/admin/products");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sản phẩm");
    await expect(page.getByLabel("Danh mục")).toBeVisible();

    await page.goto("/vi/admin/orders");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Đơn hàng");
    await expect(page.getByLabel("Trạng thái đơn")).toBeVisible();
  });
});

test.describe("admin on mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("overview, products, and orders fit the viewport", async ({ page }) => {
    await signIn(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL(/\/en\/admin$/);

    for (const path of ["/en/admin", "/en/admin/products", "/en/admin/orders"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
        .toBeLessThanOrEqual(0);
    }
  });
});
