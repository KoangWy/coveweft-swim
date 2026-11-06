import type { ChatMessage, ChatProvider, ChatRequest } from "@/server/ai";

/**
 * Privacy gate for text sent to the AI provider.
 *
 * `withPrivacyGate` wraps the provider of a turn, so every outgoing request is
 * gated: the browser history, the model's own text from earlier rounds, tool
 * call arguments, and tool results, on the primary and on the fallback. The
 * system prompt is built on the server and passes unchanged.
 *
 * `createPrivacyGate` finds personal data with independent recognizers that
 * all run on the original text; their spans are merged and replaced at the
 * end, so one replacement can never hide the context another recognizer
 * needs. It finds:
 *
 * 1. the signed-in customer's own profile values (full name, phone, email,
 *    default address, and each part of that address), matched without regard
 *    to case or Vietnamese diacritics;
 * 2. email addresses;
 * 3. phone numbers in Vietnamese and international notation (`0…`, `84…`,
 *    `+84…`, `0084…`, with spaces, dots, dashes, or parentheses);
 * 4. street addresses: a house number followed, within a few words, by a
 *    street or area word such as `đường`, `phố`, `street`, `st.`, `phường`,
 *    `ward`, `quận`, or `district`;
 * 5. names introduced by a self-introduction such as "my name is", "I'm",
 *    "tên tôi là", "tôi là", or "mình tên", with or without diacritics.
 *
 * Free-text redaction is best-effort: it cannot recognise every way a person
 * may write a name or an address, and deliberately obfuscated input (digits
 * split by words) is out of scope. The widget therefore also warns customers
 * not to type personal data. Body measurements, sizes, prices, and catalog
 * SKUs are kept. The profile itself is only used for matching and is never
 * sent to the provider.
 */

export const REDACTED = {
  name: "[name removed]",
  email: "[email removed]",
  phone: "[phone removed]",
  address: "[address removed]",
} as const;

type Placeholder = (typeof REDACTED)[keyof typeof REDACTED];

/** Profile values of the signed-in customer, used only for matching. */
export type PrivacyProfile = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  defaultAddress?: string | null;
};

export type PrivacyGate = (text: string) => string;

type Span = { start: number; end: number; placeholder: Placeholder };

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/giu;

// A run of digits that may be joined by spaces, dots, dashes, or
// parentheses, optionally starting with "+" or "(". It must not continue a
// word, so letter-prefixed identifiers such as "SW0912345678" are kept.
// Catalog SKUs always contain a letter or are at most four digits, so an
// all-digit phone-shaped token is a phone even after "SKU" or "mã".
const DIGIT_RUN = /(?<![\p{L}\p{N}])[+(]*\d(?:[\d().-]|\s(?=[\d(+]))*/gu;

// House number such as "12", "12A", "12/3", or "số 12", not part of a larger
// number (prices such as 400.000) and not followed by a unit or a currency.
const HOUSE_NUMBER =
  "(?<![\\p{L}\\p{N}.,/-])(?:(?:số|so|no\\.?)\\s*)?\\d{1,5}[a-z]?(?:\\/\\d{1,5}[a-z]?)*" +
  "(?!\\s*(?:cm|mm|kg|m\\b|tuổi|tuoi|tháng|thang|years?\\b|yrs?\\b|months?\\b|y\\b|yo\\b|lbs?\\b|in\\b|inch|%|k\\b|vnd|vnđ|đ(?![\\p{L}])|d\\b|nghìn|ngàn|triệu|trieu|usd|\\$|[.,-]\\d))(?![\\p{L}\\p{N}])";

// Unaccented forms that are also common shopping words ("quan" for quần,
// "pho", "xa") are left out to avoid hiding product questions. Abbreviations
// do not consume their dot, so the address stops at the end of the sentence.
const STREET_WORDS = [
  "đường",
  "duong",
  "phố",
  "hẻm",
  "ngõ",
  "ngách",
  "kiệt",
  "street",
  "st(?=\\.|\\s|,|$)",
  "road",
  "rd(?=\\.|\\s|,|$)",
  "avenue",
  "ave(?=\\.|\\s|,|$)",
  "lane",
  "boulevard",
  "blvd(?=\\.|\\s|,|$)",
  // Vietnamese area words, followed by a name or a number.
  "(?:phường|phuong|quận|huyện|huyen|thị xã|p\\.|q\\.)(?=\\s*[\\p{L}\\p{N}])",
  // English area words only count before a number ("District 1").
  "(?:ward|district|dist\\.)(?=\\s+\\d)",
];

const ADDRESS_WORD = "[\\p{L}\\p{N}'’.-]+";

const STREET_ADDRESS = new RegExp(
  `${HOUSE_NUMBER}\\s+(?:${ADDRESS_WORD}\\s+){0,4}?(?:${ADDRESS_WORD},\\s+)?(?:${STREET_WORDS.join("|")})(?![\\p{L}])[^;!?\\n]*?(?=[.;!?\\n](?:\\s|$)|[;!?\\n]|$)`,
  "giu",
);

// Self-introduction cues, matched on folded text (lower case, no
// diacritics), so "tôi là" and "toi la" are the same cue.
const PRONOUN = "(?:toi|minh|em|anh|chi|to|tui|tao|con)";

// A name follows these cues even when it is typed in lower case.
const EXPLICIT_CUES = [
  "my (?:full )?name is",
  "my name's",
  "(?:full )?name ?:",
  "ho (?:va )?ten ?:?",
  `ten (?:cua )?${PRONOUN} la`,
  `${PRONOUN} ten la`,
  `${PRONOUN} ten`,
];

// These cues also start ordinary sentences ("mình là nữ", "I'm looking"), so
// only capitalized words after them count as a name.
const CAPITALIZED_CUES = [`${PRONOUN} la`, "i am", "i'm", "i’m", "this is", "call me"];

const EXPLICIT_CUE = new RegExp(`(?<![a-z0-9])(?:${EXPLICIT_CUES.join("|")})(?=\\s)`, "g");
const CAPITALIZED_CUE = new RegExp(`(?<![a-z0-9])(?:${CAPITALIZED_CUES.join("|")})(?=\\s)`, "g");

const NAME_WORD = /^[\p{L}'’-]+/u;
const MAX_NAME_WORDS = 7;
const MAX_LOWERCASE_NAME_WORDS = 3;

// Words that end a lower-case name ("tên mình là lan cần size M").
const NAME_STOP_WORDS = new Set([
  "la",
  "can",
  "muon",
  "size",
  "co",
  "cao",
  "nang",
  "va",
  "o",
  "nhe",
  "a",
  "oi",
  "thi",
  "hoi",
  "dang",
  "and",
  "need",
  "want",
  "looking",
  "here",
]);

/** Lower case without diacritics; `đ` folds to `d`. */
function fold(char: string): string {
  return char.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();
}

/** Folded text plus, for every folded char, the index of its source char. */
function foldWithMap(text: string): { folded: string; source: number[] } {
  let folded = "";
  const source: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const piece = fold(text[index]!);
    folded += piece;

    for (let count = 0; count < piece.length; count += 1) {
      source.push(index);
    }
  }

  return { folded, source };
}

function foldString(text: string): string {
  return [...text].map(fold).join("").replace(/\s+/g, " ").trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function digitsOf(text: string): string {
  return text.replace(/\D/g, "");
}

function patternSpans(text: string, pattern: RegExp, placeholder: Placeholder): Span[] {
  return [...text.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    placeholder,
  }));
}

/** Occurrences of a folded value in the original text, on word boundaries. */
function valueSpans(
  text: string,
  folded: { folded: string; source: number[] },
  value: string,
  placeholder: Placeholder,
): Span[] {
  const needle = foldString(value);

  if (needle.length < 3) {
    return [];
  }

  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(needle).replace(/ /g, "\\s+")}(?![\\p{L}\\p{N}])`,
    "gu",
  );

  return [...folded.folded.matchAll(pattern)].map((match) => ({
    start: folded.source[match.index]!,
    end: folded.source[match.index + match[0].length - 1]! + 1,
    placeholder,
  }));
}

/** Recognises a phone number from its digits and leading sign. */
function isPhone(candidate: string, profileDigits: string | null): boolean {
  const digits = digitsOf(candidate);

  if (profileDigits && digits.endsWith(profileDigits)) {
    return true;
  }

  if (candidate.trimStart().startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15;
  }

  // International call prefix: 00 followed by a country code and number.
  if (digits.startsWith("00")) {
    return digits.length >= 10 && digits.length <= 17;
  }

  if (digits.startsWith("84")) {
    return digits.length === 11 || digits.length === 12;
  }

  if (digits.startsWith("0")) {
    return digits.length >= 9 && digits.length <= 11;
  }

  return false;
}

function phoneSpans(text: string, profileDigits: string | null): Span[] {
  const spans: Span[] = [];

  for (const match of text.matchAll(DIGIT_RUN)) {
    // A run can join a phone number with a following number ("0912345678
    // 86"). Try the longest prefix of whitespace-separated groups first.
    const groups = match[0].split(/(\s+)/);

    for (let end = groups.length; end > 0; end -= 2) {
      const prefix = groups.slice(0, end).join("");
      // Sentence punctuation after the number stays in the text.
      const candidate = prefix.replace(/[.-]+$/, "");

      if (isPhone(candidate, profileDigits)) {
        spans.push({
          start: match.index,
          end: match.index + candidate.length,
          placeholder: REDACTED.phone,
        });
        break;
      }
    }
  }

  return spans;
}

function isCapitalized(word: string): boolean {
  const first = word[0] ?? "";

  return first !== first.toLowerCase() && first === first.toUpperCase();
}

/** Reads the name words that start at `position` in the original text. */
function nameAfter(text: string, position: number, capitalizedOnly: boolean): Span | null {
  const words: Array<{ start: number; end: number; word: string }> = [];
  let cursor = position;

  while (words.length < MAX_NAME_WORDS) {
    const gap = /^[ \t]+/.exec(text.slice(cursor))?.[0] ?? "";
    const match = NAME_WORD.exec(text.slice(cursor + gap.length));

    if (!match || (words.length > 0 && gap.length === 0) || (words.length === 0 && !gap)) {
      break;
    }

    const start = cursor + gap.length;
    words.push({ start, end: start + match[0].length, word: match[0] });
    cursor = start + match[0].length;
  }

  if (words.length === 0) {
    return null;
  }

  let kept: typeof words;

  if (isCapitalized(words[0]!.word)) {
    const firstLower = words.findIndex((entry) => !isCapitalized(entry.word));
    kept = firstLower === -1 ? words : words.slice(0, firstLower);
  } else if (capitalizedOnly) {
    return null;
  } else {
    const stop = words.findIndex((entry) => NAME_STOP_WORDS.has(foldString(entry.word)));
    kept = (stop === -1 ? words : words.slice(0, stop)).slice(0, MAX_LOWERCASE_NAME_WORDS);
  }

  if (kept.length === 0) {
    return null;
  }

  return { start: kept[0]!.start, end: kept.at(-1)!.end, placeholder: REDACTED.name };
}

function nameSpans(text: string, folded: { folded: string; source: number[] }): Span[] {
  const spans: Span[] = [];

  for (const [pattern, capitalizedOnly] of [
    [EXPLICIT_CUE, false],
    [CAPITALIZED_CUE, true],
  ] as const) {
    for (const match of folded.folded.matchAll(pattern)) {
      const cueEnd = folded.source[match.index + match[0].length - 1]! + 1;
      const span = nameAfter(text, cueEnd, capitalizedOnly);

      if (span) {
        spans.push(span);
      }
    }
  }

  return spans;
}

const PRIORITY: Record<Placeholder, number> = {
  [REDACTED.address]: 4,
  [REDACTED.phone]: 3,
  [REDACTED.email]: 2,
  [REDACTED.name]: 1,
};

/** Merges overlapping spans; the merged span keeps the strongest placeholder. */
function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((left, right) => left.start - right.start || right.end - left.end);
  const merged: Span[] = [];

  for (const span of sorted) {
    const last = merged.at(-1);

    if (last && span.start < last.end) {
      last.end = Math.max(last.end, span.end);

      if (PRIORITY[span.placeholder] > PRIORITY[last.placeholder]) {
        last.placeholder = span.placeholder;
      }
    } else {
      merged.push({ ...span });
    }
  }

  return merged;
}

function addressParts(address: string): string[] {
  return address
    .split(/[,;\n]/)
    .flatMap((part) => [part.trim(), part.trim().replace(/^(?:số\s*)?[\d/]+[a-z]?\s+/i, "")])
    .filter((part) => foldString(part).replace(/[^a-z]/g, "").length >= 4);
}

/** Builds the gate for one customer. Without a profile, only patterns apply. */
export function createPrivacyGate(profile: PrivacyProfile | null = null): PrivacyGate {
  const values: Array<[string, Placeholder]> = [];

  if (profile?.defaultAddress) {
    values.push([profile.defaultAddress, REDACTED.address]);

    for (const part of addressParts(profile.defaultAddress)) {
      values.push([part, REDACTED.address]);
    }
  }

  if (profile?.fullName) {
    values.push([profile.fullName, REDACTED.name]);
  }

  if (profile?.email) {
    values.push([profile.email, REDACTED.email]);
  }

  const phoneDigits = profile?.phone ? digitsOf(profile.phone).replace(/^(?:0084|84|0)/, "") : "";
  const profileDigits = phoneDigits.length >= 8 ? phoneDigits : null;

  return (text: string) => {
    if (text === "") {
      return text;
    }

    const folded = foldWithMap(text);
    const phones = phoneSpans(text, profileDigits);
    const spans = mergeSpans([
      ...values.flatMap(([value, placeholder]) => valueSpans(text, folded, value, placeholder)),
      ...patternSpans(text, EMAIL, REDACTED.email),
      ...phones,
      // The last digit group of a phone number is not a house number.
      ...patternSpans(text, STREET_ADDRESS, REDACTED.address).filter(
        (address) =>
          !phones.some((phone) => address.start >= phone.start && address.start < phone.end),
      ),
      ...nameSpans(text, folded),
    ]);

    let result = text;

    for (const span of spans.reverse()) {
      result = `${result.slice(0, span.start)}${span.placeholder}${result.slice(span.end)}`;
    }

    return result;
  };
}

/** Applies the gate to every string inside a JSON value, keeping its shape. */
function gateJsonValue(value: unknown, gate: PrivacyGate): unknown {
  if (typeof value === "string") {
    return gate(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => gateJsonValue(entry, gate));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, gateJsonValue(entry, gate)]),
    );
  }

  return value;
}

/**
 * Gates JSON text such as tool arguments or tool results: string values are
 * redacted and the structure stays valid JSON. Text that is not JSON is gated
 * as plain text.
 */
export function gateJson(text: string, gate: PrivacyGate): string {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return gate(text);
  }

  return JSON.stringify(gateJsonValue(parsed, gate));
}

/** Gates one outgoing message. Ids, names, and roles are kept. */
export function gateMessage(message: ChatMessage, gate: PrivacyGate): ChatMessage {
  switch (message.role) {
    case "system":
      return message;
    case "user":
      return { role: "user", content: gate(message.content) };
    case "assistant":
      return {
        role: "assistant",
        content: gate(message.content),
        ...(message.toolCalls
          ? {
              toolCalls: message.toolCalls.map((call) => ({
                id: call.id,
                name: call.name,
                arguments: gateJson(call.arguments, gate),
              })),
            }
          : {}),
      };
    case "tool":
      return {
        role: "tool",
        toolCallId: message.toolCallId,
        name: message.name,
        content: gateJson(message.content, gate),
      };
  }
}

/**
 * Wraps a provider so every request it sends is gated, whichever round or
 * fallback model serves it. The wrapper keeps the provider's turn state.
 */
export function withPrivacyGate(provider: ChatProvider, gate: PrivacyGate): ChatProvider {
  const gated = (request: ChatRequest): ChatRequest => ({
    ...request,
    messages: request.messages.map((message) => gateMessage(message, gate)),
  });

  return {
    get model() {
      return provider.model;
    },
    stream: (request) => provider.stream(gated(request)),
    complete: (request) => provider.complete(gated(request)),
  };
}
