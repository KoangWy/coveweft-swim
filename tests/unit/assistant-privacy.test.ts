import { describe, expect, it } from "vitest";

import type { ChatProvider, ChatRequest, ProviderEvent } from "@/server/ai";
import { createPrivacyGate, gateJson, withPrivacyGate } from "@/server/assistant/privacy";
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
    ["0084912345678", "Phone [phone removed] please"],
    ["0084 912 345 678", "Phone [phone removed] please"],
    ["0044 20 7946 0958", "Phone [phone removed] please"],
    ["+1 (415) 555-2671", "Phone [phone removed] please"],
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
    ["tôi là Trần Văn Nam, cần size XL", "tôi là [name removed], cần size XL"],
    ["toi la Tran Van Nam, can size XL", "toi la [name removed], can size XL"],
    ["Mình là Lan nè, size M có không?", "Mình là [name removed] nè, size M có không?"],
    ["em tên Hoa, cao 158 cm", "em tên [name removed], cao 158 cm"],
    ["Em tên là Thu Trang.", "Em tên là [name removed]."],
    ["tên mình là lan cần size M", "tên mình là [name removed] cần size M"],
    ["tôi tên là Trần Văn Nam, cần size XL", "tôi tên là [name removed], cần size XL"],
    [
      "My name is Alexandra Maria Elizabeth Jane Nguyen. Size M?",
      "My name is [name removed]. Size M?",
    ],
    ["Hi, I'm Jane Doe and I need size S", "Hi, I'm [name removed] and I need size S"],
    ["This is Minh Anh, any rash guard?", "This is [name removed], any rash guard?"],
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
    "Mình là nữ, cao 160 cm, mình là khách mới",
    "I'm looking for a swimsuit; I am size M",
    "SKU SW0912345678 or mã SW100, item 10F1",
    "Ngực 086 cm, eo 068 cm, hông 095 cm",
  ])("keeps shopping text unchanged: %s", (input) => {
    expect(gate(input)).toBe(input);
  });
});

it("treats an all-digit phone-shaped token as a phone even after SKU, unlike catalog SKUs", () => {
  expect(gate("SKU 0912345678")).toBe("SKU [phone removed]");
  expect(gate("mã sản phẩm: 0912345678")).toBe("mã sản phẩm: [phone removed]");
  expect(gate("SKU 10F1, SW100, GGP")).toBe("SKU 10F1, SW100, GGP");
});

it("redacts a split phone number and an address without merging them", () => {
  expect(gate("Gọi 0912 345 678 giao quận 3 nhé")).toBe("Gọi [phone removed] giao quận 3 nhé");
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

  it("recognizes an address even when a part of it is a profile value", () => {
    expect(profileGate("Giao đến 123 Lê Lợi, Quận 1")).toBe("Giao đến [address removed]");
    expect(profileGate("Quận 1 thì ship mấy ngày?")).toBe("[address removed] thì ship mấy ngày?");
  });

  it("redacts the profile phone with a 0084 prefix", () => {
    expect(profileGate("0084 912 345 678")).toBe("[phone removed]");
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

describe("gateJson", () => {
  it("redacts inside string values and keeps the JSON structure", () => {
    const gateWithProfile = createPrivacyGate({ email: "lan@example.com" });
    const output = gateJson(
      JSON.stringify({
        query: "gửi lan@example.com",
        limit: 3,
        nested: [{ note: "0912 345 678" }],
      }),
      gateWithProfile,
    );

    expect(JSON.parse(output)).toEqual({
      query: "gửi [email removed]",
      limit: 3,
      nested: [{ note: "[phone removed]" }],
    });
  });

  it("gates text that is not JSON as plain text", () => {
    expect(gateJson("{not json 0912 345 678", gate)).toBe("{not json [phone removed]");
  });
});

describe("withPrivacyGate", () => {
  it("gates every message of every request and keeps the tool protocol fields", async () => {
    const seen: ChatRequest[] = [];
    const inner: ChatProvider = {
      model: "inner",
      async *stream(request): AsyncGenerator<ProviderEvent> {
        seen.push(request);
        yield { type: "finish", reason: "stop", usage: null };
      },
      async complete(request) {
        seen.push(request);
        return { text: "", toolCalls: [], reason: "stop", usage: null };
      },
    };
    const provider = withPrivacyGate(inner, createPrivacyGate({ fullName: "Nguyễn Thị Lan" }));
    const request: ChatRequest = {
      messages: [
        { role: "system", content: "System prompt with 0912 345 678 stays." },
        { role: "user", content: "tôi là Nguyễn Thị Lan" },
        {
          role: "assistant",
          content: "Chào NGUYEN THI LAN",
          toolCalls: [
            { id: "call_1", name: "searchProducts", arguments: '{"query":"Lan 0912345678"}' },
          ],
        },
        {
          role: "tool",
          toolCallId: "call_1",
          name: "searchProducts",
          content: '{"data":{"items":[{"sku":"SW100","description":"Call 0912 345 678"}]}}',
        },
      ],
    };

    const events: ProviderEvent[] = [];

    for await (const event of provider.stream(request)) {
      events.push(event);
    }

    expect(events).toEqual([{ type: "finish", reason: "stop", usage: null }]);
    await provider.complete(request);

    for (const sent of seen) {
      expect(sent.messages).toEqual([
        { role: "system", content: "System prompt with 0912 345 678 stays." },
        { role: "user", content: "tôi là [name removed]" },
        {
          role: "assistant",
          content: "Chào [name removed]",
          toolCalls: [
            { id: "call_1", name: "searchProducts", arguments: '{"query":"Lan [phone removed]"}' },
          ],
        },
        {
          role: "tool",
          toolCallId: "call_1",
          name: "searchProducts",
          content: '{"data":{"items":[{"sku":"SW100","description":"Call [phone removed]"}]}}',
        },
      ]);
    }
    expect(provider.model).toBe("inner");
  });
});
