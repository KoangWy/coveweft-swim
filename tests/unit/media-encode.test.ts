import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { encodeStudioImage } from "../../scripts/media/encode.ts";
import { MEDIA_WIDTHS } from "../../scripts/media/inventory.ts";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "coveweft-encode-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("encodeStudioImage", () => {
  it("exports every width as WebP, keeps the aspect ratio, and strips metadata", async () => {
    const directory = await temporaryDirectory();
    const input = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 20, g: 90, b: 140 } },
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: "source", Orientation: "6" } })
      .toBuffer();

    const sourceMetadata = await sharp(input).metadata();
    expect(sourceMetadata.exif).toBeDefined();

    const sizes = await encodeStudioImage(input, directory, { sku: "A", position: 1 });

    expect(
      Object.keys(sizes)
        .map(Number)
        .sort((left, right) => left - right),
    ).toEqual([...MEDIA_WIDTHS]);

    const expectedWidths: Record<number, number> = { 480: 480, 960: 960, 1600: 1200 };
    for (const width of MEDIA_WIDTHS) {
      const output = sizes[width];
      expect(output.width).toBe(expectedWidths[width]);
      expect(output.height).toBe(Math.round((800 / 1200) * expectedWidths[width]));
      expect(output.path).toBe(`studio/A/01-${width}.webp`);

      const file = await readFile(path.join(directory, ...output.path.split("/")));
      expect(file.length).toBe(output.bytes);

      const metadata = await sharp(file).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.exif).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
      expect(metadata.iptc).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
    }
  });

  it("fails on input that is not an image", async () => {
    const directory = await temporaryDirectory();

    await expect(
      encodeStudioImage(Buffer.from("not an image"), directory, { sku: "A", position: 1 }),
    ).rejects.toThrow();
  });
});
