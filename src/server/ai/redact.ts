const MAX_DETAIL_LENGTH = 500;
const MIN_FRAGMENT_LENGTH = 6;
const MASK = "***";

/** Fields and chunk types that carry model reasoning. */
const REASONING_KEYS = new Set(["reasoning_content", "reasoning", "thinking"]);

/**
 * Masks credentials in text: bearer tokens, the given secrets, any fragment
 * of a secret of six or more characters (such as a truncated key), and long
 * opaque tokens that look like API keys.
 */
export function redactSecrets(text: string, secrets: readonly string[] = []): string {
  const known = secrets.filter((secret) => secret.length >= MIN_FRAGMENT_LENGTH);
  let result = text.replace(/\bBearer\s+\S+/gi, `Bearer ${MASK}`);

  for (const secret of known) {
    result = result.split(secret).join(MASK);
  }

  result = result.replace(/[A-Za-z0-9_-]{6,}/g, (token) =>
    known.some((secret) => secret.includes(token)) ? MASK : token,
  );

  return result.replace(/\b[A-Za-z0-9]{32,}\b/g, MASK);
}

/** Removes reasoning fields and `thinking` chunks from a parsed JSON value. */
export function stripReasoning(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter(
        (entry) =>
          !(
            entry &&
            typeof entry === "object" &&
            (entry as { type?: unknown }).type === "thinking"
          ),
      )
      .map(stripReasoning);
  }

  if (value && typeof value === "object") {
    if ((value as { type?: unknown }).type === "thinking") {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !REASONING_KEYS.has(key))
        .map(([key, entry]) => [key, stripReasoning(entry)]),
    );
  }

  return value;
}

/**
 * Prepares text for `ProviderError.detail`: redacts first, then truncates, so
 * truncation can never expose part of a key that redaction would have masked.
 */
export function sanitizeDetail(
  text: string | null | undefined,
  secrets: readonly string[] = [],
): string | null {
  if (text === null || text === undefined) {
    return null;
  }

  const redacted = redactSecrets(text.trim(), secrets);

  if (redacted === "") {
    return null;
  }

  return redacted.length > MAX_DETAIL_LENGTH
    ? `${redacted.slice(0, MAX_DETAIL_LENGTH)}…`
    : redacted;
}
