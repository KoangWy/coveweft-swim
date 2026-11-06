import { sha256 } from "./files.ts";

const DRIVE_DOWNLOAD_URL = "https://drive.usercontent.google.com/download";

export const DEFAULT_ATTEMPTS = 6;
export const DEFAULT_BASE_DELAY_MS = 1_000;
export const DEFAULT_TIMEOUT_MS = 60_000;
export const MAX_RETRY_DELAY_MS = 30_000;
const RETRYABLE_STATUS = new Set([403, 408, 425, 429]);
const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface DownloadResult {
  data: Buffer;
  bytes: number;
  sha256: string;
  contentType: string | null;
}

export interface DownloadRetryInfo {
  driveFileId: string;
  attempt: number;
  attempts: number;
  reason: string;
  delayMs: number;
}

export interface DownloadOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (milliseconds: number) => Promise<void>;
  onRetry?: (info: DownloadRetryInfo) => void;
}

export class DownloadError extends Error {
  readonly driveFileId: string;
  readonly attempts: number;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    options: {
      driveFileId: string;
      attempts: number;
      status?: number | null;
      retryable: boolean;
      retryAfterMs?: number | null;
    },
  ) {
    super(message);
    this.name = "DownloadError";
    this.driveFileId = options.driveFileId;
    this.attempts = options.attempts;
    this.status = options.status ?? null;
    this.retryable = options.retryable;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

export function driveDownloadUrl(driveFileId: string): string {
  return `${DRIVE_DOWNLOAD_URL}?id=${encodeURIComponent(driveFileId)}&export=download&confirm=t`;
}

/**
 * Fetch one original from the shared Drive folder with bounded concurrency at
 * the caller, and retry here with exponential backoff on throttling and
 * transient failures.
 */
export async function downloadDriveFile(
  driveFileId: string,
  options: DownloadOptions = {},
): Promise<DownloadResult> {
  if (!DRIVE_ID_PATTERN.test(driveFileId)) {
    throw new Error(`Invalid Drive file ID: "${driveFileId}"`);
  }

  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? MAX_RETRY_DELAY_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? defaultSleep;

  let lastFailure: DownloadError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let failure: DownloadError;
    try {
      const response = await fetchImpl(driveDownloadUrl(driveFileId), {
        redirect: "follow",
        headers: {
          accept: "image/webp,image/jpeg,image/png,image/*;q=0.9,*/*;q=0.1",
          "user-agent": "coveweft-media-pipeline/1.0 (+https://github.com/KoangWy/coveweft-swim)",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        failure = new DownloadError(`HTTP ${response.status} ${response.statusText}`.trim(), {
          driveFileId,
          attempts: attempt,
          status: response.status,
          retryable,
          retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
        });
      } else {
        const contentType = response.headers.get("content-type");
        const data = Buffer.from(await response.arrayBuffer());
        const declaredImage = Boolean(contentType?.toLowerCase().startsWith("image/"));
        if (data.length === 0) {
          failure = new DownloadError("Empty response body", {
            driveFileId,
            attempts: attempt,
            status: response.status,
            retryable: true,
          });
        } else if (!declaredImage && !looksLikeImage(data)) {
          failure = new DownloadError(`Unexpected content type ${contentType ?? "unknown"}`, {
            driveFileId,
            attempts: attempt,
            status: response.status,
            retryable: true,
          });
        } else {
          return {
            data,
            bytes: data.length,
            sha256: sha256(data),
            contentType,
          };
        }
      }
    } catch (error) {
      failure = new DownloadError(error instanceof Error ? error.message : String(error), {
        driveFileId,
        attempts: attempt,
        retryable: true,
      });
    }

    lastFailure = failure;
    if (!failure.retryable || attempt === attempts) {
      throw failure;
    }

    const delayMs = retryDelayMs(attempt, baseDelayMs, maxDelayMs, failure);
    options.onRetry?.({
      driveFileId,
      attempt,
      attempts,
      reason: failure.message,
      delayMs,
    });
    await sleep(delayMs);
  }

  throw (
    lastFailure ?? new DownloadError("Download failed", { driveFileId, attempts, retryable: false })
  );
}

/** Retry the full 5xx range, plus throttling and transient 4xx statuses. */
export function isRetryableStatus(status: number): boolean {
  return (status >= 500 && status <= 599) || RETRYABLE_STATUS.has(status);
}

export function retryDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  failure?: DownloadError,
): number {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 250);
  const backoff = Math.min(maxDelayMs, exponential) + jitter;
  return failure?.retryAfterMs ? Math.max(backoff, failure.retryAfterMs) : backoff;
}

/** Retry-After is either seconds or an HTTP date; cap both to a minute. */
function parseRetryAfter(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(60_000, Math.round(seconds * 1_000));
  }
  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return null;
  }
  return Math.min(60_000, Math.max(0, date - Date.now()));
}

/** Some downloads arrive as application/octet-stream, so sniff the header. */
export function looksLikeImage(data: Buffer): boolean {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return true;
  }
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return true;
  }
  if (
    data.length >= 12 &&
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  ) {
    return true;
  }
  return data.length >= 6 && data.toString("ascii", 0, 3) === "GIF";
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
