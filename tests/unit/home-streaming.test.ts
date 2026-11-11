import { Children, isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ products: vi.fn(), settings: vi.fn() }));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/server/catalog", () => ({ listProducts: reads.products }));
vi.mock("@/lib/store-settings", () => ({ getStoreSettings: reads.settings }));
vi.mock("@/i18n/navigation", () => ({
  Link: () => null,
  useRouter: vi.fn(),
  usePathname: () => "/",
}));

import HomePage from "@/app/[locale]/(storefront)/(home)/page";
import { HeroBackdrop } from "@/features/home/components/hero-backdrop";
import { HeroIntro } from "@/features/home/components/hero-intro";

function contains(node: ReactNode, type: unknown): boolean {
  return Children.toArray(node).some((child) =>
    isValidElement<{ children?: ReactNode }>(child)
      ? child.type === type || contains(child.props.children, type)
      : false,
  );
}

it("returns the hero while catalog and shipping reads are still pending", async () => {
  reads.products.mockImplementation(() => new Promise(() => {}));
  reads.settings.mockImplementation(() => new Promise(() => {}));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const page = await Promise.race([
      HomePage(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Hero is waiting for catalog data")), 100);
      }),
    ]);
    expect(contains(page, HeroBackdrop)).toBe(true);
    expect(contains(page, HeroIntro)).toBe(true);
    expect(reads.products).toHaveBeenCalled();
    expect(reads.settings).toHaveBeenCalled();
  } finally {
    clearTimeout(timer);
  }
});
