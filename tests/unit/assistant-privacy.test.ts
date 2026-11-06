import { describe, expect, it } from "vitest";

import { createPrivacyGate } from "@/server/assistant/privacy";
import { runTool } from "@/server/assistant/tools";

const gate = createPrivacyGate();

describe("privacy gate patterns", () => {
  it.each([
    ["(091) 234 5678", "Phone [phone removed] please"],
    ["+84 (912) 345 678", "Phone [phone removed] please"],
    ["+84 912 345 678", "Phone [phone removed] please"],
    ["84912345678", "Phone [phone removed] please"],
    ["0912.345.678", "Phone [phone removed] please"],
    ["0912-345-678", "Phone [phone removed] please"],
    ["0283 123 4567", "Phone [phone removed] please"],
    ["(028) 3812-3456", "Phone [phone removed] please"],
  ])("redacts the phone number %s", (phone, expected) => {
    expect(gate(`Phone ${phone} please`)).toBe(expected);
  });

  it("keeps the sentence around a phone number and a following measurement", () => {
    expect(gate("Gọi 0912345678 86 cm nhé.")).toBe("Gọi [phone removed] 86 cm nhé.");
    expect(gate("Số mình là 0912 345 678.")).toBe("Số mình là [phone removed].");
  });

  it("redacts email addresses, including Unicode local parts", () => {
    expect(gate("Mail lan.nguyen+shop@example.com.vn or hà@ví.dụ.vn")).toBe(
      "Mail [email removed] or [email removed]",
    );
  });

  it.each([
    [
      "Ship to 123 Le Loi Street, District 1. Is size M in stock?",
      "Ship to [address removed]. Is size M in stock?",
    ],
    ["Ship to 123 Le Loi, District 1.", "Ship to [address removed]."],
    ["Giao tới số 12 Nguyễn Huệ, phường Bến Nghé, quận 1 nhé.", "Giao tới [address removed]."],
    ["Nhà mình ở 45/7 đường Lê Lợi, Q. 3", "Nhà mình ở [address removed]. 3"],
    ["I live at 7B Baker St. in town", "I live at [address removed]. in town"],
  ])("redacts the street address in %s", (input, expected) => {
    expect(gate(input)).toBe(expected);
  });

  it.each([
    ["My name is Jane Nguyen. Size?", "My name is [name removed]. Size?"],
    ["Mình tên là Nguyễn Thị Lan, cao 160 cm.", "Mình tên là [name removed], cao 160 cm."],
    ["tên tôi là lan", "tên tôi là [name removed]"],
    ["Họ và tên: Trần Văn Nam", "Họ và tên: [name removed]"],
  ])("redacts a stated name in %s", (input, expected) => {
    expect(gate(input)).toBe(expected);
  });

  it("redacts every personal detail of the review example", () => {
    expect(
      gate(
        "My name is Jane Nguyen. Ship to 123 Le Loi, District 1. Phone (091) 234 5678 or +84 (912) 345 678.",
      ),
    ).toBe(
      "My name is [name removed]. Ship to [address removed]. Phone [phone removed] or [phone removed].",
    );
  });

  it.each([
    "Mình cao 165 cm, nặng 55 kg, ở quận 7 thì giao bao lâu?",
    "Ngực 86 cm, eo 68 cm, hông 95 cm; bé 3 tuổi, 40 tháng, cao 97cm.",
    "Đồ bơi dưới 400.000 VND, size 2XL hoặc 3XL, giá 1.200.000đ",
    "Chest 86, waist 68, hips 95 — size M or L? Budget 12.500.000 VND.",
    "Mua 2 quần bơi và 1 áo, giao đến quận 3 được không?",
    "Order 10 swimsuits for the district team",
    "SKU SWRML costs 343000 VND; 840.000.000 VND is too much",
  ])("keeps shopping text unchanged: %s", (input) => {
    expect(gate(input)).toBe(input);
  });
});

describe("privacy gate with the customer profile", () => {
  const profileGate = createPrivacyGate({
    fullName: "Nguyễn Thị Lan",
    email: "lan@example.com",
    phone: "+84 912 345 678",
    defaultAddress: "12 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP Hồ Chí Minh",
  });

  it("redacts the profile name with or without diacritics and in any case", () => {
    expect(profileGate("Chào NGUYEN THI LAN, đây là gợi ý.")).toBe(
      "Chào [name removed], đây là gợi ý.",
    );
    expect(profileGate("nguyễn thị lan cần size M")).toBe("[name removed] cần size M");
  });

  it("redacts the profile phone in another notation and the address parts", () => {
    expect(profileGate("Gọi 912-345-678 hoặc giao về Nguyen Hue, phuong ben nghe")).toBe(
      "Gọi [phone removed] hoặc giao về [address removed], [address removed]",
    );
    expect(profileGate("Giao tới tp hồ chí minh được không?")).toBe(
      "Giao tới [address removed] được không?",
    );
  });

  it("redacts the profile email in any case", () => {
    expect(profileGate("LAN@EXAMPLE.COM")).toBe("[email removed]");
  });

  it("keeps measurements and sizes", () => {
    expect(profileGate("Ngực 86 cm, eo 68 cm, hông 95 cm, size L")).toBe(
      "Ngực 86 cm, eo 68 cm, hông 95 cm, size L",
    );
  });
});

describe("runTool dispatch", () => {
  it.each(["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty", "nope"])(
    "treats %s as an unknown tool",
    async (name) => {
      const context = { locale: "en" as const, catalog: {} as never, cards: new Map() };

      expect(JSON.parse(await runTool(name, "{}", context))).toEqual({
        data: { error: "unknown_tool" },
      });
    },
  );
});
