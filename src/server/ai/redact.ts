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

  result = maskFragments(result, known);

  return result.replace(/\b[A-Za-z0-9]{32,}\b/g, MASK);
}

/**
 * Masks every substring of `text` that is a fragment of a secret of at least
 * six characters, even when it is joined to other text, as in
 * `invalid-key-<prefix>`. Overlapping matches merge into one mask.
 */
function maskFragments(text: string, secrets: readonly string[]): string {
  if (secrets.length === 0 || text.length < MIN_FRAGMENT_LENGTH) {
    return text;
  }

  const grams = new Set<string>();

  for (const secret of secrets) {
    for (let start = 0; start + MIN_FRAGMENT_LENGTH <= secret.length; start += 1) {
      grams.add(secret.slice(start, start + MIN_FRAGMENT_LENGTH));
    }
  }

  const covered = new Uint8Array(text.length);
  let found = false;

  for (let start = 0; start + MIN_FRAGMENT_LENGTH <= text.length; start += 1) {
    if (grams.has(text.slice(start, start + MIN_FRAGMENT_LENGTH))) {
      covered.fill(1, start, start + MIN_FRAGMENT_LENGTH);
      found = true;
    }
  }

  if (!found) {
    return text;
  }

  let result = "";

  for (let index = 0; index < text.length; index += 1) {
    if (!covered[index]) {
      result += text[index];
    } else if (index === 0 || !covered[index - 1]) {
      result += MASK;
    }
  }

  return result;
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
