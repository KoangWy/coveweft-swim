import { describe, expect, it, vi } from "vitest";

import {
  DownloadError,
  downloadDriveFile,
  driveDownloadUrl,
  isRetryableStatus,
  looksLikeImage,
  retryDelayMs,
} from "../../scripts/media/download.ts";
import { sha256 } from "../../scripts/media/files.ts";

const IMAGE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03]);

function imageResponse(): Response {
  return new Response(IMAGE, { status: 200, headers: { "content-type": "image/jpeg" } });
}

describe("downloadDriveFile", () => {
  it("builds the public download URL and returns the hashed payload", async () => {
    const fetchImpl = vi.fn(async () => imageResponse());
    const result = await downloadDriveFile("abc_-123", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(driveDownloadUrl("abc_-123")).toBe(
      "https://drive.usercontent.google.com/download?id=abc_-123&export=download&confirm=t",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.bytes).toBe(IMAGE.length);
    expect(result.sha256).toBe(sha256(IMAGE));
    expect(result.contentType).toBe("image/jpeg");
  });

  it("retries a throttled response and honors Retry-After", async () => {
    const fetchImpl = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response("slow down", { status: 429, headers: { "retry-after": "2" } }),
      )
      .mockResolvedValueOnce(imageResponse());
    const sleepImpl = vi.fn(async (milliseconds: number) => {
      void milliseconds;
    });
    const onRetry = vi.fn();

    const result = await downloadDriveFile("abc", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl,
      onRetry,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.sha256).toBe(sha256(IMAGE));
    expect(sleepImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl.mock.calls[0][0]).toBeGreaterThanOrEqual(2000);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        attempts: 6,
        reason: expect.stringContaining("HTTP 429"),
      }),
    );
  });

  it("retries when Drive returns an HTML page instead of an image", async () => {
    const fetchImpl = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response("<html>quota</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(imageResponse());
    const sleepImpl = vi.fn(async () => undefined);

    const result = await downloadDriveFile("abc", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl,
      baseDelayMs: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.bytes).toBe(IMAGE.length);
  });

  it("accepts a real image body served as application/octet-stream", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(IMAGE, {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
    );

    const result = await downloadDriveFile("abc", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.sha256).toBe(sha256(IMAGE));
    expect(looksLikeImage(IMAGE)).toBe(true);
  });

  it("does not retry a permanent 404", async () => {
    const fetchImpl = vi.fn(async () => new Response("missing", { status: 404 }));
    const sleepImpl = vi.fn(async () => undefined);

    await expect(
      downloadDriveFile("abc", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleepImpl,
      }),
    ).rejects.toMatchObject({ status: 404, retryable: false, attempts: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it.each([500, 501, 507, 599])("retries HTTP %i from the 5xx range", async (status) => {
    const fetchImpl = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response("busy", { status }))
      .mockResolvedValueOnce(imageResponse());
    const sleepImpl = vi.fn(async () => undefined);

    const result = await downloadDriveFile("abc", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl,
      baseDelayMs: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.sha256).toBe(sha256(IMAGE));
    expect(sleepImpl).toHaveBeenCalledTimes(1);
  });

  it("classifies the full 5xx range as retryable", () => {
    for (const status of [500, 501, 502, 503, 504, 507, 599]) {
      expect(isRetryableStatus(status)).toBe(true);
    }
    for (const status of [400, 401, 404, 418, 422]) {
      expect(isRetryableStatus(status)).toBe(false);
    }
  });

  it("gives up after the configured number of attempts", async () => {
    const fetchImpl = vi.fn(async () => new Response("busy", { status: 503 }));
    const sleepImpl = vi.fn(async () => undefined);

    await expect(
      downloadDriveFile("abc", {
        attempts: 3,
        baseDelayMs: 1,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleepImpl,
      }),
    ).rejects.toBeInstanceOf(DownloadError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleepImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects an unsafe Drive file ID before fetching", async () => {
    await expect(downloadDriveFile("../secret")).rejects.toThrow(/Invalid Drive file ID/);
  });
});

describe("retryDelayMs", () => {
  it("grows exponentially and respects a server Retry-After", () => {
    expect(retryDelayMs(1, 1000, 30_000)).toBeGreaterThanOrEqual(1000);
    expect(retryDelayMs(3, 1000, 30_000)).toBeGreaterThanOrEqual(4000);

    const throttled = new DownloadError("HTTP 429", {
      driveFileId: "abc",
      attempts: 1,
      retryable: true,
      retryAfterMs: 5000,
    });
    expect(retryDelayMs(1, 1000, 30_000, throttled)).toBeGreaterThanOrEqual(5000);
  });
});
