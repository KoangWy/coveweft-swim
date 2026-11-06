import { describe, expect, it } from "vitest";

import {
  parseCliArgs,
  assertKnownOptions,
  optionalIntegerOption,
} from "../../scripts/media/args.ts";
import { parseCsv } from "../../scripts/media/csv.ts";
import {
  compareText,
  mediaPath,
  parseInventoryCsv,
  positionLabel,
  selectStudioImages,
} from "../../scripts/media/inventory.ts";

const HEADER = "id,name,type,group,folder_path,path,sku";

function row(
  id: string,
  name: string,
  type: string,
  group: string,
  folderPath: string,
  sku: string,
): string {
  return `${id},${name},${type},${group},${folderPath},${folderPath}/${name},${sku}`;
}

describe("parseCsv", () => {
  it("handles a BOM, CRLF rows, quoted commas, and doubled quotes", () => {
    const rows = parseCsv('\uFEFFid,note\r\n1,"thumbnail, stripped"\r\n2,"said ""hello"""\r\n');

    expect(rows).toEqual([
      ["id", "note"],
      ["1", "thumbnail, stripped"],
      ["2", 'said "hello"'],
    ]);
  });

  it("rejects an unterminated quoted field", () => {
    expect(() => parseCsv('id,note\n1,"open')).toThrow(/Unterminated/);
  });
});

describe("parseInventoryCsv", () => {
  it("reads the columns the media pipeline needs", () => {
    const rows = parseInventoryCsv(
      `${HEADER}\r\nabc,studio.jpg,image,studio,SOBIE/studio/A,SOBIE/studio/A/studio.jpg,A\r\n`,
    );

    expect(rows).toEqual([
      {
        id: "abc",
        name: "studio.jpg",
        type: "image",
        group: "studio",
        folderPath: "SOBIE/studio/A",
        path: "SOBIE/studio/A/studio.jpg",
        sku: "A",
      },
    ]);
  });

  it("fails when a required column is missing", () => {
    expect(() => parseInventoryCsv("id,name,type\nabc,studio.jpg,image\n")).toThrow(
      /required columns/,
    );
  });
});

describe("selectStudioImages", () => {
  const rows = parseInventoryCsv(
    [
      HEADER,
      row("b2", "B_s02.jpg", "image", "studio", "SOBIE/studio/B", "B"),
      row("f1", "B_f01.jpg", "image", "feedback", "SOBIE/feedback/B", "B"),
      row("a10", "A_s10.jpg", "image", "studio", "SOBIE/studio/A", "A"),
      row("folder", "A", "folder", "studio", "SOBIE/studio", ""),
      row("a2", "A_s02.jpg", "image", "studio", "SOBIE/studio/A", "A"),
      row("a1", "A_s01.jpg", "image", "studio", "SOBIE/studio/A", "A"),
      row("b1", "B_s01.jpg", "image", "studio", "SOBIE/studio/B", "B"),
    ].join("\r\n"),
  );

  it("keeps only studio images and numbers them by ascending file name", () => {
    const images = selectStudioImages(rows);

    expect(images.map((image) => `${image.sku}/${image.position}`)).toEqual([
      "A/1",
      "A/2",
      "A/3",
      "B/1",
      "B/2",
    ]);
    expect(images[2]).toMatchObject({
      driveFileId: "a10",
      sku: "A",
      sourceName: "A_s10.jpg",
      position: 3,
    });
  });

  it("rejects duplicate Drive file IDs", () => {
    const duplicate = parseInventoryCsv(
      [
        HEADER,
        row("same", "A_s01.jpg", "image", "studio", "SOBIE/studio/A", "A"),
        row("same", "A_s02.jpg", "image", "studio", "SOBIE/studio/A", "A"),
      ].join("\r\n"),
    );

    expect(() => selectStudioImages(duplicate)).toThrow(/more than once/);
  });

  it("rejects a folder and SKU mismatch", () => {
    const mismatch = parseInventoryCsv(
      `${HEADER}\r\nabc,A_s01.jpg,image,studio,SOBIE/studio/B,A\r\n`,
    );

    expect(() => selectStudioImages(mismatch)).toThrow(/SKU/);
  });

  it("rejects more photos than the two-digit position allows", () => {
    const many = [
      HEADER,
      ...Array.from({ length: 100 }, (_, index) =>
        row(
          `id${index}`,
          `A_s${String(index + 1).padStart(2, "0")}.jpg`,
          "image",
          "studio",
          "SOBIE/studio/A",
          "A",
        ),
      ),
    ].join("\r\n");

    expect(() => selectStudioImages(parseInventoryCsv(many))).toThrow(/two-digit/);
  });
});

describe("media paths", () => {
  it("formats the shared studio path convention", () => {
    expect(mediaPath("10F1", 1, 480)).toBe("studio/10F1/01-480.webp");
    expect(mediaPath("AIMEE", 23, 1600)).toBe("studio/AIMEE/23-1600.webp");
  });

  it("pads positions and rejects values outside 1-99", () => {
    expect(positionLabel(7)).toBe("07");
    expect(() => positionLabel(0)).toThrow();
    expect(() => positionLabel(100)).toThrow();
  });

  it("compares text by code unit so sort order is locale independent", () => {
    expect(compareText("A_s02.jpg", "A_s10.jpg")).toBeLessThan(0);
    expect(compareText("A", "A")).toBe(0);
  });
});

describe("parseCliArgs", () => {
  it("parses values, inline values, and boolean flags", () => {
    const args = parseCliArgs(
      ["--inventory", "inventory.csv", "--limit=20", "--no-archive", "--out", ".media-build"],
      ["no-archive"],
    );

    expect(args.options.get("inventory")).toBe("inventory.csv");
    expect(args.options.get("limit")).toBe("20");
    expect(args.options.get("no-archive")).toBe(true);
    expect(args.options.get("out")).toBe(".media-build");
  });

  it("does not let a boolean flag consume the next option", () => {
    const args = parseCliArgs(["--no-archive", "--limit", "3"], ["no-archive"]);

    expect(args.options.get("no-archive")).toBe(true);
    expect(args.options.get("limit")).toBe("3");
  });

  it("validates integer bounds and unknown options", () => {
    const args = parseCliArgs(["--limit", "0"]);

    expect(() => optionalIntegerOption(args, "limit", { min: 1 })).toThrow(/at least 1/);
    expect(() => assertKnownOptions(args, ["limit"])).not.toThrow();
    expect(() => assertKnownOptions(args, ["out"])).toThrow(/Unknown option/);
  });
});
