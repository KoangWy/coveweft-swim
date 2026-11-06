import { describe, expect, it } from "vitest";

import { buildReleaseImageUrl, buildUploadImageUrl } from "@/server/media/service";

describe("media URLs", () => {
  it("builds a release URL from the base path and size", () => {
    expect(buildReleaseImageUrl("https://media.example.com/studio-v1", "studio/WSA7/01", 480)).toBe(
      "https://media.example.com/studio-v1/studio/WSA7/01-480.webp",
    );
  });

  it("trims a trailing slash on the base URL", () => {
    expect(
      buildReleaseImageUrl("https://media.example.com/studio-v1/", "studio/WSA7/01", 1600),
    ).toBe("https://media.example.com/studio-v1/studio/WSA7/01-1600.webp");
  });

  it("normalizes a path that already has a size suffix", () => {
    expect(buildReleaseImageUrl("https://media.example.com", "studio/WSA7/01-960.webp", 960)).toBe(
      "https://media.example.com/studio/WSA7/01-960.webp",
    );
  });

  it("builds a public storage URL for an upload", () => {
    expect(
      buildUploadImageUrl("http://127.0.0.1:54321", "product-uploads", "product-1/image name.webp"),
    ).toBe(
      "http://127.0.0.1:54321/storage/v1/object/public/product-uploads/product-1/image%20name.webp",
    );
  });

  it("encodes path segments but keeps the separators", () => {
    expect(buildReleaseImageUrl("https://media.example.com", "/studio/W S/01/", 480)).toBe(
      "https://media.example.com/studio/W%20S/01-480.webp",
    );
  });
});
