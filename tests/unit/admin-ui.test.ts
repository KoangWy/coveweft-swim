import { describe, expect, it } from "vitest";

import {
  adminOrderHref,
  adminProductHref,
  hasActiveOrderFilters,
  hasActiveProductFilters,
  parseAdminOrderQuery,
  parseAdminProductQuery,
  toAdminListOrdersInput,
  toAdminListProductsInput,
} from "@/features/admin/components/admin-query";
import {
  availableOrderActions,
  isWaitingForTransfer,
} from "@/features/admin/components/order-actions";

describe("admin product query", () => {
  it("uses defaults for missing or unknown values", () => {
    expect(parseAdminProductQuery({})).toEqual({
      q: undefined,
      category: undefined,
      productType: undefined,
      status: "all",
      stock: "all",
      page: 1,
    });
    expect(parseAdminProductQuery({ status: "wrong", stock: "wrong", page: "-2" })).toMatchObject({
      status: "all",
      stock: "all",
      page: 1,
    });
  });

  it("reads filters and merges repeated parameters", () => {
    expect(
      parseAdminProductQuery({
        q: "  rash guard ",
        category: ["Tops", "Bottoms"],
        type: "Rash guard",
        status: "hidden",
        stock: "low",
        page: "3",
      }),
    ).toEqual({
      q: "rash guard",
      category: "Tops",
      productType: "Rash guard",
      status: "hidden",
      stock: "low",
      page: 3,
    });
  });

  it("serializes a product URL and resets the page on filter changes", () => {
    const query = parseAdminProductQuery({ q: "guard", status: "hidden", page: "4" });

    expect(adminProductHref(query)).toBe("/admin/products?q=guard&status=hidden&page=4");
    expect(adminProductHref(query, { stock: "low" })).toBe(
      "/admin/products?q=guard&status=hidden&stock=low",
    );
    expect(adminProductHref(query, { page: 2 })).toBe(
      "/admin/products?q=guard&status=hidden&page=2",
    );
  });

  it("maps the sale and stock filters to the service input", () => {
    const query = parseAdminProductQuery({ status: "hidden", stock: "out", page: "2" });

    expect(toAdminListProductsInput(query)).toEqual({
      q: undefined,
      category: undefined,
      productType: undefined,
      isActive: false,
      stockState: "out",
      page: 2,
      pageSize: 20,
    });
    expect(
      toAdminListProductsInput(parseAdminProductQuery({ status: "active", stock: "all" })),
    ).toMatchObject({ isActive: true, stockState: undefined });
  });

  it("detects active product filters", () => {
    expect(hasActiveProductFilters(parseAdminProductQuery({}))).toBe(false);
    expect(hasActiveProductFilters(parseAdminProductQuery({ stock: "low" }))).toBe(true);
  });
});

describe("admin order query", () => {
  it("accepts known status and payment filters only", () => {
    expect(
      parseAdminOrderQuery({
        status: "shipping",
        paymentStatus: "paid",
        paymentMethod: "cod",
        page: "2",
      }),
    ).toEqual({
      q: undefined,
      status: "shipping",
      paymentStatus: "paid",
      paymentMethod: "cod",
      page: 2,
    });
    expect(
      parseAdminOrderQuery({ status: "lost", paymentStatus: "maybe", paymentMethod: "cash" }),
    ).toEqual({
      q: undefined,
      status: undefined,
      paymentStatus: undefined,
      paymentMethod: undefined,
      page: 1,
    });
  });

  it("serializes an order URL and resets the page on filter changes", () => {
    const query = parseAdminOrderQuery({ q: "0901", status: "pending", page: "2" });

    expect(adminOrderHref(query)).toBe("/admin/orders?q=0901&status=pending&page=2");
    expect(adminOrderHref(query, { paymentMethod: "cod" })).toBe(
      "/admin/orders?q=0901&status=pending&paymentMethod=cod",
    );
  });

  it("maps the query to the service input and detects active filters", () => {
    const query = parseAdminOrderQuery({ paymentStatus: "unpaid", page: "3" });

    expect(toAdminListOrdersInput(query)).toEqual({
      q: undefined,
      status: undefined,
      paymentStatus: "unpaid",
      paymentMethod: undefined,
      page: 3,
      pageSize: 20,
    });
    expect(hasActiveOrderFilters(query)).toBe(true);
    expect(hasActiveOrderFilters(parseAdminOrderQuery({}))).toBe(false);
  });
});

describe("admin order actions", () => {
  it("confirms a COD order while it is unpaid", () => {
    expect(
      availableOrderActions({
        status: "pending",
        paymentMethod: "cod",
        paymentStatus: "unpaid",
      }),
    ).toEqual(["confirm", "cancel"]);
  });

  it("waits for a bank transfer to be paid before confirmation", () => {
    const unpaid = {
      status: "pending" as const,
      paymentMethod: "bank_transfer" as const,
      paymentStatus: "unpaid" as const,
    };
    expect(availableOrderActions(unpaid)).toEqual(["cancel"]);
    expect(isWaitingForTransfer(unpaid)).toBe(true);

    expect(availableOrderActions({ ...unpaid, paymentStatus: "paid" })).toEqual([
      "confirm",
      "cancel",
    ]);
    expect(isWaitingForTransfer({ ...unpaid, paymentStatus: "paid" })).toBe(false);
  });

  it("follows the shipping and delivery steps", () => {
    expect(
      availableOrderActions({
        status: "confirmed",
        paymentMethod: "cod",
        paymentStatus: "unpaid",
      }),
    ).toEqual(["ship", "cancel"]);
    expect(
      availableOrderActions({
        status: "shipping",
        paymentMethod: "cod",
        paymentStatus: "unpaid",
      }),
    ).toEqual(["deliver"]);
    expect(
      availableOrderActions({
        status: "delivered",
        paymentMethod: "cod",
        paymentStatus: "paid",
      }),
    ).toEqual([]);
    expect(
      availableOrderActions({
        status: "cancelled",
        paymentMethod: "cod",
        paymentStatus: "unpaid",
      }),
    ).toEqual([]);
  });
});
