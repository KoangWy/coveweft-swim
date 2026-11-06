import { describe, expect, it } from "vitest";

import { mediaPath, MEDIA_WIDTHS, type MediaWidth } from "../../scripts/media/inventory.ts";
import {
  buildManifest,
  sizeOutputs,
  validateManifest,
  type ManifestEntry,
  type SizeOutput,
} from "../../scripts/media/manifest.ts";

function makeSize(width: MediaWidth, position: number, sku: string): SizeOutput {
  return {
    path: mediaPath(sku, position, width),
    width,
    height: width * 2,
    bytes: width * 10,
    sha256: "a".repeat(64),
  };
}

function makeEntry(sku: string, position: number, driveFileId: string): ManifestEntry {
  const sizes = {} as Record<MediaWidth, SizeOutput>;
  for (const width of MEDIA_WIDTHS) {
    sizes[width] = makeSize(width, position, sku);
  }
  return { sku, position, driveFileId, sizes };
}

function makeManifest(entries: ManifestEntry[]) {
  return {
    version: 1,
    createdAt: "2026-11-06T00:00:00.000Z",
    imageCount: entries.length,
    entries,
  };
}

describe("validateManifest", () => {
  it("accepts a complete manifest and keeps the typed entries", () => {
    const result = validateManifest(makeManifest([makeEntry("A", 1, "id-a")]));

    expect(result.errors).toEqual([]);
    expect(result.manifest?.imageCount).toBe(1);
    expect(result.manifest?.entries[0].sizes[480].path).toBe("studio/A/01-480.webp");
    expect(sizeOutputs(result.manifest!.entries[0])).toHaveLength(3);
  });

  it("rejects an unexpected size path", () => {
    const entry = makeEntry("A", 1, "id-a");
    entry.sizes[960].path = "studio/A/02-960.webp";

    const result = validateManifest(makeManifest([entry]));

    expect(result.manifest).toBeNull();
    expect(result.errors.join("\n")).toContain("sizes.960.path must be studio/A/01-960.webp");
  });

  it("rejects a bad hash and a mismatched image count", () => {
    const entry = makeEntry("A", 1, "id-a");
    entry.sizes[480].sha256 = "not-a-hash";

    const result = validateManifest({ ...makeManifest([entry]), imageCount: 2 });

    expect(result.manifest).toBeNull();
    expect(result.errors.join("\n")).toContain("sha256");
    expect(result.errors.join("\n")).toContain("imageCount");
  });

  it("rejects duplicate positions and Drive file IDs", () => {
    const first = makeEntry("A", 1, "same-id");
    const second = makeEntry("A", 1, "same-id");

    const result = validateManifest(makeManifest([first, second]));

    expect(result.manifest).toBeNull();
    expect(result.errors.join("\n")).toContain("duplicates A:1");
    expect(result.errors.join("\n")).toContain("repeats Drive file ID");
  });

  it("only requires contiguous positions for a full build", () => {
    const entries = [makeEntry("A", 1, "id-a"), makeEntry("A", 3, "id-c")];

    expect(validateManifest(makeManifest(entries)).manifest).toBeNull();
    expect(
      validateManifest(makeManifest(entries), { requireContiguousPositions: false }).manifest,
    ).not.toBeNull();
  });
});

describe("buildManifest", () => {
  it("writes entries in inventory order", () => {
    const entry = makeEntry("A", 1, "id-a");
    const manifest = buildManifest(
      [
        { driveFileId: "id-a", sku: "A", position: 1 },
        { driveFileId: "id-b", sku: "B", position: 1 },
      ],
      new Map([
        ["id-a", { sizes: entry.sizes }],
        ["id-b", { sizes: makeEntry("B", 1, "id-b").sizes }],
      ]),
      "2026-11-06T00:00:00.000Z",
    );

    expect(manifest.entries.map((item) => item.driveFileId)).toEqual(["id-a", "id-b"]);
    expect(manifest.entries[0].sizes[1600].path).toBe("studio/A/01-1600.webp");
  });

  it("fails when an image has no processed output", () => {
    expect(() =>
      buildManifest(
        [{ driveFileId: "id-a", sku: "A", position: 1 }],
        new Map(),
        "2026-11-06T00:00:00.000Z",
      ),
    ).toThrow(/Missing processed entry/);
  });
});
