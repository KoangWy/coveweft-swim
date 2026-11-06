/**
 * Privacy gate for text sent to the AI provider.
 *
 * Every user and assistant message passes through `createPrivacyGate` before
 * any provider request. It removes, in order:
 *
 * 1. the signed-in customer's own profile values (full name, phone, email,
 *    default address, and each part of that address), matched without regard
 *    to case or Vietnamese diacritics;
 * 2. email addresses;
 * 3. phone numbers in Vietnamese and international notation (`0…`, `84…`,
 *    `+84…`, with spaces, dots, dashes, or parentheses);
 * 4. street addresses: a house number followed, within a few words, by a
 *    street or area word such as `đường`, `phố`, `street`, `st.`, `phường`,
 *    `ward`, `quận`, or `district`;
 * 5. names introduced by a first-person phrase such as "my name is" or
 *    "tên mình là".
 *
 * Free-text redaction is best-effort: it cannot recognise every way a person
 * may write a name or an address, so the widget also warns customers not to
 * type personal data. Body measurements, sizes, and prices are kept. The
 * profile itself is only used for matching and is never sent to the provider.
 */

export const REDACTED = {
  name: "[name removed]",
  email: "[email removed]",
  phone: "[phone removed]",
  address: "[address removed]",
} as const;

/** Profile values of the signed-in customer, used only for matching. */
export type PrivacyProfile = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  defaultAddress?: string | null;
};

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/giu;

// A run of digits that may be joined by spaces, dots, dashes, or
// parentheses, optionally starting with "+" or "(".
const DIGIT_RUN = /[+(]*\d(?:[\d().-]|\s(?=[\d(+]))*/g;

const LETTER = "\\p{L}";

// House number such as "12", "12A", "12/3", or "số 12", not part of a larger
// number (prices such as 400.000) and not followed by a unit.
const HOUSE_NUMBER =
  "(?<![\\p{L}\\p{N}.,/])(?:(?:số|so|no\\.?)\\s*)?\\d{1,5}[a-z]?(?:\\/\\d{1,5}[a-z]?)*" +
  "(?!\\s*(?:cm|mm|kg|m\\b|tuổi|tuoi|tháng|thang|years?\\b|yrs?\\b|months?\\b|y\\b|yo\\b|lbs?\\b|in\\b|inch|%|k\\b|vnd|vnđ|đ(?![\\p{L}])|d\\b|nghìn|ngàn|triệu|trieu|usd|\\$|[.,]\\d))(?![\\p{L}\\p{N}])";

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

const NAME_CUES = [
  "my name is",
  "my name's",
  "my full name is",
  "name:",
  "full name:",
  "họ tên:?",
  "họ và tên:?",
  "tên (?:của )?(?:tôi|mình|em|anh|chị|tớ|tui) là",
  "(?:tôi|mình|em|anh|chị|tớ|tui) tên là",
  "(?:tôi|mình|em|anh|chị|tớ|tui) tên",
  "ten (?:cua )?(?:toi|minh|em|anh|chi) la",
  "(?:toi|minh|em|anh|chi) ten(?: la)?",
];

// Up to four words after the cue; words stop at punctuation.
const NAME_STATEMENT = new RegExp(
  `(?<![${LETTER}])(${NAME_CUES.join("|")})\\s+([${LETTER}'’-]+(?:\\s+[${LETTER}'’-]+){0,3})`,
  "giu",
);

/** Lower case without diacritics; `đ` folds to `d`. One input char may map to zero or more output chars. */
function fold(char: string): string {
  return char
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
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

/** Replaces each occurrence of a folded value, matched on word boundaries. */
function redactValue(text: string, value: string, placeholder: string): string {
  const needle = foldString(value);

  if (needle.length < 3) {
    return text;
  }

  const { folded, source } = foldWithMap(text);
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(needle).replace(/ /g, "\\s+")}(?![\\p{L}\\p{N}])`,
    "gu",
  );
  const spans: Array<[number, number]> = [];

  for (const match of folded.matchAll(pattern)) {
    const start = source[match.index]!;
    const end = source[match.index + match[0].length - 1]! + 1;
    spans.push([start, end]);
  }

  let result = text;

  for (const [start, end] of spans.reverse()) {
    result = `${result.slice(0, start)}${placeholder}${result.slice(end)}`;
  }

  return result;
}

/** Recognises a phone number from its digits and leading sign. */
function isPhone(candidate: string, profileDigits: string | null): boolean {
  const digits = digitsOf(candidate);
  const plus = candidate.trimStart().startsWith("+");

  if (profileDigits && digits.endsWith(profileDigits)) {
    return true;
  }

  if (plus) {
    return digits.length >= 8 && digits.length <= 15;
  }

  if (digits.startsWith("84")) {
    return digits.length === 11 || digits.length === 12;
  }

  if (digits.startsWith("0")) {
    return digits.length >= 9 && digits.length <= 11;
  }

  return false;
}

function redactPhones(text: string, profilePhone: string | null): string {
  const profileDigits = profilePhone ? digitsOf(profilePhone).replace(/^(?:84|0)/, "") : null;
  const usable = profileDigits && profileDigits.length >= 8 ? profileDigits : null;

  return text.replace(DIGIT_RUN, (run) => {
    // A run can join a phone number with a following number ("0912345678
    // 86"). Try the longest prefix of whitespace-separated groups first.
    const groups = run.split(/(\s+)/);

    for (let end = groups.length; end > 0; end -= 2) {
      const prefix = groups.slice(0, end).join("");
      // Sentence punctuation after the number stays in the text.
      const tail = prefix.match(/[.-]+$/)?.[0] ?? "";
      const candidate = prefix.slice(0, prefix.length - tail.length);

      if (isPhone(candidate, usable)) {
        return `${REDACTED.phone}${tail}${groups.slice(end).join("")}`;
      }
    }

    return run;
  });
}

function addressParts(address: string): string[] {
  return address
    .split(/[,;\n]/)
    .flatMap((part) => [part.trim(), part.trim().replace(/^(?:số\s*)?[\d/]+[a-z]?\s+/i, "")])
    .filter((part) => foldString(part).replace(/[^a-z]/g, "").length >= 4);
}

/** Builds the gate for one customer. Without a profile, only patterns apply. */
export function createPrivacyGate(profile: PrivacyProfile | null = null): (text: string) => string {
  const values: Array<[string, string]> = [];

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

  // Longer values first, so a full address wins over its parts.
  values.sort((left, right) => right[0].length - left[0].length);

  return (text: string) => {
    let result = text;

    for (const [value, placeholder] of values) {
      result = redactValue(result, value, placeholder);
    }

    result = result.replace(EMAIL, REDACTED.email);
    result = redactPhones(result, profile?.phone ?? null);
    result = result.replace(STREET_ADDRESS, REDACTED.address);
    result = result.replace(NAME_STATEMENT, (_match, cue: string) => `${cue} ${REDACTED.name}`);

    return result;
  };
}
