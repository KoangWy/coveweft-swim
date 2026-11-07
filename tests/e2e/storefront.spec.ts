import { expect, test, type Page } from "@playwright/test";

// Storefront purchase flows against the local Supabase stack. Every test that
// buys something signs up a fresh customer, so tests stay independent.

const PRODUCT_SKU = "BB25CR";
const PRODUCT_NAME = "Cherry swimsuit";
const PRODUCT_OPTION = "M (3Y)";
const DEMO_CUSTOMER = {
  email: process.env.DEMO_CUSTOMER_EMAIL ?? "customer@demo.coveweft.local",
  password: process.env.DEMO_CUSTOMER_PASSWORD ?? "demo-customer-123",
};

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@demo.coveweft.local`;
}

async function chooseOption(page: Page, option = PRODUCT_OPTION) {
  await page.locator("label", { hasText: option }).first().click();
}

async function addToCart(page: Page) {
  await page.getByRole("button", { name: "Add to cart" }).first().click();
}

async function signUp(page: Page, next = "/account") {
  await page.goto(`/en/sign-up?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Full name").fill("Lan Nguyen Test");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByLabel(/I have read and agree/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).not.toHaveURL(/sign-up/);
}

async function fillCheckout(page: Page, payment: "Cash on delivery" | "Bank transfer (simulated)") {
  await page.getByLabel("Recipient name").fill("Lan Nguyen Test");
  await page.getByLabel("Phone number").fill("0901 234 567");
  await page.getByLabel("Delivery address").fill("12 Test Street, District 1, Ho Chi Minh City");
  await page.getByRole("radio", { name: payment }).check();
}

async function buyOne(page: Page) {
  await page.goto(`/en/products/${PRODUCT_SKU}`);
  await chooseOption(page);
  await addToCart(page);
  await expect(page.getByText(`${PRODUCT_NAME} was added to your cart.`)).toBeVisible();
  await page.goto("/en/checkout");
}

for (const viewport of VIEWPORTS) {
  test.describe(`purchase flow (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("visitor browses, signs up, orders with cash on delivery, and cancels", async ({
      page,
    }) => {
      // Browse and filter.
      await page.goto("/en/shop?group=kids");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kids");
      await page.goto(`/en/shop?q=${encodeURIComponent("cherry")}&type=Swimsuit`);
      await expect(page.getByText("Search: cherry")).toBeVisible();
      await page.getByRole("link", { name: PRODUCT_NAME }).first().click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(PRODUCT_NAME);
      await expect(page.getByRole("heading", { name: "Demo Size Guide" })).toBeVisible();

      // Adding to the cart needs an account.
      await chooseOption(page);
      await addToCart(page);
      await expect(page).toHaveURL(/\/en\/sign-in\?next=/);
      await expect(page.getByText(/add items to your cart/)).toBeVisible();
      await page.getByRole("link", { name: "Create account" }).click();
      await expect(page).toHaveURL(/\/en\/sign-up\?next=/);

      // Sign-up is blocked without consent; the checkbox starts unchecked.
      const consent = page.getByLabel(/I have read and agree/);
      await expect(consent).not.toBeChecked();
      await page.getByLabel("Full name").fill("Lan Nguyen Test");
      await page.getByLabel("Email").fill(uniqueEmail());
      await page.getByLabel("Password").fill("e2e-password-123");
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(
        page.getByText("Please accept the privacy policy to create an account."),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/en\/sign-up/);

      await page.getByLabel("Password").fill("e2e-password-123");
      await consent.check();
      await page.getByRole("button", { name: "Create account" }).click();

      // Back on the same product with the chosen option.
      await expect(page).toHaveURL(new RegExp(`/en/products/${PRODUCT_SKU}\\?variant=`));
      await expect(
        page.getByRole("radio", { name: new RegExp(PRODUCT_OPTION.replace(/[()]/g, "\\$&")) }),
      ).toBeChecked();
      await addToCart(page);
      await expect(page.getByText(`${PRODUCT_NAME} was added to your cart.`)).toBeVisible();
      await expect(page.getByRole("link", { name: "Cart, 1 item" })).toBeVisible();

      // Cart and checkout.
      await page.goto("/en/cart");
      await expect(page.getByRole("link", { name: PRODUCT_NAME })).toBeVisible();
      await page.getByRole("link", { name: "Go to checkout" }).click();
      await expect(page).toHaveURL(/\/en\/checkout$/);
      await expect(
        page.getByRole("main").getByRole("link", { name: "terms of use" }),
      ).toBeVisible();
      await fillCheckout(page, "Cash on delivery");
      await page.getByRole("button", { name: "Place order" }).click();

      await expect(page).toHaveURL(/\/en\/checkout\/confirmation\//);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Thank you, your order is placed",
      );
      await expect(page.getByText("Order: Pending").first()).toBeVisible();
      await expect(page.getByText("Payment: Unpaid").first()).toBeVisible();

      // Order detail and cancellation.
      await page.getByRole("link", { name: "View order" }).click();
      await expect(page).toHaveURL(/\/en\/account\/orders\/[0-9a-f-]+$/);
      await page.getByRole("button", { name: "Cancel order" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Cancel order" }).click();
      await expect(page.getByText("Order: Cancelled").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);

      // Signing out clears the tab's session storage.
      await page.evaluate(() => window.sessionStorage.setItem("assistant-history", "[]"));
      await page.goto("/en/account");
      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page).toHaveURL(/\/en$/);
      expect(await page.evaluate(() => window.sessionStorage.length)).toBe(0);
    });

    test("bank transfer: a failed simulated payment can be retried", async ({ page }) => {
      await signUp(page);
      await buyOne(page);
      await fillCheckout(page, "Bank transfer (simulated)");
      await page.getByRole("button", { name: "Place order" }).click();

      await expect(page).toHaveURL(/\/en\/account\/orders\/[0-9a-f-]+\/pay$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Simulated payment");
      await expect(page.getByRole("timer")).toHaveText(/^\d{2}:\d{2}$/);

      await page.getByRole("button", { name: "Simulate failure" }).click();
      await expect(page.getByText("The simulated payment failed")).toBeVisible();
      await expect(page.getByText("Payment: Unpaid").first()).toBeVisible();

      await page.getByRole("button", { name: "Simulate success" }).click();
      await expect(page).toHaveURL(/\/en\/checkout\/confirmation\//);
      await expect(page.getByText("Payment: Paid").first()).toBeVisible();
    });
  });
}

test("clicking Place order twice creates one order", async ({ page }) => {
  await signUp(page);
  await buyOne(page);
  await fillCheckout(page, "Cash on delivery");
  await page.getByRole("button", { name: "Place order" }).dblclick();
  await expect(page).toHaveURL(/\/en\/checkout\/confirmation\//);

  await page.goto("/en/account/orders");
  await expect(page.getByRole("link", { name: /^Order [0-9A-F]{8}/ })).toHaveCount(1);
});

test("submitting the same checkout again returns the same order", async ({ page }) => {
  await signUp(page);
  await buyOne(page);
  await fillCheckout(page, "Cash on delivery");
  // Submit the same form twice without waiting, as a slow network retry would.
  await page.evaluate(() => {
    const form = document.querySelector("form:has(input[name=idempotencyKey])") as HTMLFormElement;
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(page).toHaveURL(/\/en\/checkout\/confirmation\//);

  await page.goto("/en/account/orders");
  await expect(page.getByRole("link", { name: /^Order [0-9A-F]{8}/ })).toHaveCount(1);
});

test("a rejected checkout moves focus to the first invalid field", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page);
  await buyOne(page);
  await fillCheckout(page, "Cash on delivery");
  // Spaces pass the browser's required check but not the server's.
  await page.getByLabel("Delivery address").fill("   ");
  await page.getByRole("button", { name: "Place order" }).click();

  const address = page.getByLabel("Delivery address");
  await expect(address).toBeFocused();
  await expect(address).toHaveAttribute("aria-invalid", "true");
  await expect(address).toBeInViewport();
  await expect(page).toHaveURL(/\/en\/checkout$/);
});

test("sign-in returns to the product in the same language", async ({ page }) => {
  await page.goto(`/vi/products/${PRODUCT_SKU}`);
  await chooseOption(page);
  await page.getByRole("button", { name: "Thêm vào giỏ" }).first().click();
  await expect(page).toHaveURL(/\/vi\/sign-in\?next=/);

  await page.getByLabel("Email").fill(DEMO_CUSTOMER.email);
  await page.getByLabel("Mật khẩu").fill(DEMO_CUSTOMER.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(new RegExp(`/vi/products/${PRODUCT_SKU}\\?variant=`));
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
});

test("shop filters live in the URL", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/en/shop");
  const filters = page.getByRole("form", { name: "Filters" }).first();

  await filters.getByLabel("In stock only").check();
  await expect(page).toHaveURL(/inStock=1/);
  await filters.getByRole("radio", { name: /^Tops/ }).check();
  await expect(page).toHaveURL(/category=Tops/);
  await expect(page.getByRole("list", { name: "Active filters" })).toContainText("In stock only");

  await page.getByRole("combobox", { name: "Sort by" }).selectOption("price-asc");
  await expect(page).toHaveURL(/sort=price-asc/);
  await expect(page).toHaveURL(/category=Tops/);

  // The filtered URL renders the same filters in Vietnamese.
  const url = new URL(page.url());
  await page.goto(url.pathname.replace("/en/", "/vi/") + url.search);
  await expect(page.getByRole("list", { name: "Bộ lọc đang dùng" })).toContainText("Chỉ hàng còn");
});

test("the mobile listing opens filters in a drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/shop");
  await page.getByRole("button", { name: "Filters" }).click();
  const drawer = page.getByRole("dialog", { name: "Filters" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("radio", { name: /^Accessories/ }).check();
  await expect(page).toHaveURL(/category=Accessories/);
});

test("choosing a drawer filter from the keyboard keeps focus on that option", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/shop");
  await page.getByRole("button", { name: "Filters" }).click();
  const drawer = page.getByRole("dialog", { name: "Filters" });
  const all = drawer.getByRole("group", { name: "Category" }).getByRole("radio").first();
  await all.focus();
  // Arrow keys move through the radio group and select the next option.
  let tops = drawer.getByRole("radio", { name: /^Tops/ });
  for (let i = 0; i < 20 && !(await tops.isChecked()); i += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(page).toHaveURL(/category=Tops/);
  await expect(drawer).toBeVisible();
  tops = drawer.getByRole("radio", { name: /^Tops/ });
  await expect(tops).toBeFocused();
  await expect(tops).toBeChecked();
});

test("filters and sort follow the URL on Back and Forward", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/en/shop");
  const filters = page.getByRole("form", { name: "Filters" }).first();
  const sort = page.getByRole("combobox", { name: "Sort by" });

  await filters.getByRole("radio", { name: /^Tops/ }).check();
  await expect(page).toHaveURL(/category=Tops/);
  await sort.selectOption("price-asc");
  await expect(page).toHaveURL(/sort=price-asc/);

  await page.goBack();
  await expect(page).not.toHaveURL(/sort=/);
  await expect(sort).toHaveValue("newest");
  await expect(filters.getByRole("radio", { name: /^Tops/ })).toBeChecked();

  await page.goBack();
  await expect(page).not.toHaveURL(/category=/);
  await expect(filters.getByRole("radio", { name: /^Tops/ })).not.toBeChecked();
  await expect(
    filters.getByRole("group", { name: "Category" }).getByRole("radio").first(),
  ).toBeChecked();

  await page.goForward();
  await page.goForward();
  await expect(page).toHaveURL(/sort=price-asc/);
  await expect(sort).toHaveValue("price-asc");
  await expect(filters.getByRole("radio", { name: /^Tops/ })).toBeChecked();
});

test("a search with no results shows the empty state", async ({ page }) => {
  await page.goto("/en/shop?q=zzzz-no-such-product");
  await expect(page.getByRole("heading", { name: "No products match" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear all" }).first()).toBeVisible();
});

test("sold-out options are disabled and labeled", async ({ page }) => {
  await page.goto("/en/products/BILY");
  const soldOut = page.getByRole("radio", { name: /^S\b/ });
  await expect(soldOut).toBeDisabled();
  await expect(page.locator("label", { hasText: /^SSold out$/ })).toBeVisible();
});

test("an accessory shows specifications instead of a size table", async ({ page }) => {
  await page.goto("/en/products/10F1");
  await expect(page.getByRole("heading", { name: "Specifications" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demo Size Guide" })).toHaveCount(0);
});

test("a product page links the delivery and returns policies before the cart button", async ({
  page,
}) => {
  await page.goto(`/en/products/${PRODUCT_SKU}`);
  const policy = page.getByRole("link", { name: "returns policy" });
  const button = page.getByRole("button", { name: "Add to cart" }).first();
  const [policyBox, buttonBox] = await Promise.all([policy.boundingBox(), button.boundingBox()]);
  expect(policyBox && buttonBox && policyBox.y < buttonBox.y).toBe(true);
});

test("the product purchase controls work from the keyboard", async ({ page }) => {
  await page.goto(`/en/products/${PRODUCT_SKU}`);
  await page.getByRole("radio", { name: /^S \(2Y\)/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /^M \(3Y\)/ })).toBeChecked();
  await page.getByRole("button", { name: "Add to cart" }).first().focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/en\/sign-in\?next=/);
});

for (const locale of ["en", "vi"] as const) {
  test(`an unknown product is a localized 404 (${locale})`, async ({ page }) => {
    const response = await page.goto(`/${locale}/products/NO-SUCH-SKU-123`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      locale === "en" ? "Page not found" : "Không tìm thấy trang",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
  });
}

test("account pages send visitors to sign in and keep the return path", async ({ page }) => {
  for (const path of ["/cart", "/checkout", "/account", "/account/orders"]) {
    await page.goto(`/vi${path}`);
    await expect(page).toHaveURL(new RegExp(`/vi/sign-in\\?next=${encodeURIComponent(path)}`));
  }
});
