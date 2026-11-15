import type { Locale } from "@/lib/locale";

/**
 * Scoring for the product retrieval evaluation of the shopping assistant.
 * Every check compares the answer with catalog rows read straight from the
 * database, never with what the model or the tools reported.
 */

/** The catalog facts an answer is judged against. */
export type CatalogTruth = {
  sku: string;
  name: string;
  gender: string;
  category: string;
  productType: string;
  material: string | null;
  colorFamily: string | null;
  /** English caption, which names every colour of a multi-colour product. */
  caption: string;
  priceVnd: number;
  /** Option labels with stock left. */
  availableSizes: string[];
};

export type RetrievalCase = {
  id: string;
  locale: Locale;
  question: string;
  /**
   * `match`: every card must satisfy `relevant`, and at least one card must be shown.
   * `lookup`: the one product `relevant` selects must be shown.
   * `none`: no product satisfies `relevant`; the answer must say so.
   */
  kind: "match" | "lookup" | "none";
  relevant: (product: CatalogTruth) => boolean;
  /** `match`: a card must be one of the cheapest relevant products. */
  cheapest?: boolean;
  /** `lookup`: the size whose stock the customer asks about. */
  size?: string;
  /** Tools the model must call. */
  tools?: string[];
};

/** What one assistant turn produced. */
export type TurnRecord = {
  answer: string;
  /** SKUs of the product cards sent with the answer, in order. */
  cards: string[];
  toolCalls: Array<{ name: string; arguments: string }>;
  /** Product and variant SKUs that catalog reads returned during the turn. */
  retrieved: string[];
  error: string | null;
};

export type EvalContext = {
  truth: ReadonlyMap<string, CatalogTruth>;
  /** Amounts an answer may state without a product: fees and thresholds. */
  policyAmounts: readonly number[];
  /** Option label words such as `XL` or `4Y`, which are not SKUs. */
  optionWords: ReadonlySet<string>;
};

export type CaseScore = {
  id: string;
  kind: RetrievalCase["kind"];
  passed: boolean;
  failures: string[];
  cards: number;
  relevantCards: number;
  /** A relevant product reached the cards; `null` for `none` cases. */
  hit: boolean | null;
  /** SKUs the answer cites that no tool returned in this turn. */
  ungroundedSkus: string[];
  /** Product lines whose stated price differs from the catalog price. */
  priceErrors: string[];
};

const CATALOG_TOOLS = new Set(["searchProducts", "getProductDetails", "getAvailableVariants"]);
const CITATION_WORDS = new Set(["VND", "VNĐ", "COD", "UPF", "SKU", "AI", "PVC", "TPR"]);

const AMOUNT =
  /(₫\s?)?(\d{1,3}(?:[.,]\d{3})+|\d+)\s?(k(?!\p{L})|nghìn|ngàn|₫|đồng|vnđ|vnd|đ(?!\p{L}))?/giu;

const ABSENCE: Record<Locale, RegExp> = {
  vi: /(không|chưa)\s+(có|tìm thấy|thấy|bán|kinh doanh)|hiện (không|chưa)|rất tiếc|tiếc là/iu,
  en: /\b(don['’]t|do not|doesn['’]t|does not|couldn['’]t|could not|can['’]t|cannot)\s+(\w+\s+)?(have|carry|sell|find|offer|stock|see)\b|\bno\s+(matching|results?|products?|items?)\b|\b(nothing|none)\b|\bunfortunately\b|\bsorry\b|\bnot\s+(available|found|in our)\b/i,
};

const OUT_OF_STOCK: Record<Locale, RegExp> = {
  vi: /hết hàng|đã hết|tạm hết|không còn|hết size/iu,
  en: /out of stock|sold out|unavailable|not (currently )?(available|in stock)/i,
};

const IN_STOCK: Record<Locale, RegExp> = {
  vi: /còn hàng|vẫn còn|còn size/iu,
  en: /\bin stock\b|\bavailable\b/i,
};

/**
 * Reads the VND amounts in a text: `₫350,000`, `350.000đ`, `350,000 VND`,
 * `350k`, or `350 nghìn`. A bare number is not an amount.
 */
export function parseVndAmounts(text: string): number[] {
  const amounts: number[] = [];

  for (const [, prefix, digits, suffix] of text.matchAll(AMOUNT)) {
    if (!prefix && !suffix) {
      continue;
    }

    const scale = suffix && /^(k|nghìn|ngàn)$/iu.test(suffix) ? 1000 : 1;
    const value = Number(digits!.replace(/[.,]/g, "")) * scale;

    if (value >= 1000) {
      amounts.push(value);
    }
  }

  return amounts;
}

/** Numbers the customer wrote, read both as dong and as thousands of dong. */
function questionAmounts(question: string): number[] {
  return [...question.matchAll(/\d{1,3}(?:[.,]\d{3})+|\d+/g)].flatMap(([digits]) => {
    const value = Number(digits.replace(/[.,]/g, ""));

    return [value, value * 1000];
  });
}

/**
 * SKUs cited in the `Name (SKU)` form the system prompt asks for: a
 * parenthesis holding one upper-case code with a letter, optionally labelled
 * `SKU:`. Stock counts, option labels, and common abbreviations are not SKUs.
 */
export function citedSkus(answer: string, context: EvalContext): string[] {
  const skus = new Set<string>();

  for (const [, inner] of answer.matchAll(/\(([^()\n]{1,60})\)/g)) {
    const token = inner!.replace(/^\s*(sku|mã)\s*[:#]?\s*/iu, "").trim();

    if (
      (context.truth.has(token) || /^(?=.*[A-Z])[A-Z0-9][A-Z0-9-]{1,31}$/.test(token)) &&
      !context.optionWords.has(token) &&
      !CITATION_WORDS.has(token)
    ) {
      skus.add(token);
    }
  }

  return [...skus];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentions(line: string, product: CatalogTruth): boolean {
  const sku = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(product.sku)}(?![\\p{L}\\p{N}])`, "u");

  return sku.test(line) || line.toLowerCase().includes(product.name.toLowerCase());
}

/**
 * Checks the prices on each answer line. A line that names products may
 * only state their catalog prices, the customer's own numbers, or store
 * fees. Any other line may also state the price of a product retrieved in
 * this turn, since list answers often put the price on its own line.
 */
function priceErrors(
  answer: string,
  question: string,
  retrieved: CatalogTruth[],
  context: EvalContext,
): string[] {
  const allowed = new Set([...questionAmounts(question), ...context.policyAmounts]);
  const errors: string[] = [];

  for (const line of answer.split(/\r?\n/)) {
    const amounts = parseVndAmounts(line);

    if (amounts.length === 0) {
      continue;
    }

    const named = retrieved.filter((product) => mentions(line, product));
    const prices = new Set((named.length > 0 ? named : retrieved).map((p) => p.priceVnd));
    const wrong = amounts.filter((amount) => !prices.has(amount) && !allowed.has(amount));

    if (wrong.length > 0) {
      errors.push(`${line.trim().slice(0, 120)} [${wrong.join(", ")}]`);
    }
  }

  return errors;
}

export function scoreCase(
  testCase: RetrievalCase,
  turn: TurnRecord,
  context: EvalContext,
): CaseScore {
  const failures: string[] = [];
  const cards = turn.cards.flatMap((sku) => context.truth.get(sku) ?? []);
  const relevantCards = cards.filter(testCase.relevant);
  const relevantTruth = [...context.truth.values()].filter(testCase.relevant);
  const retrieved = turn.retrieved.flatMap((sku) => context.truth.get(sku) ?? []);
  const grounded = new Set([...turn.retrieved, ...testCase.question.split(/[^\p{L}\p{N}-]+/u)]);
  const ungroundedSkus = citedSkus(turn.answer, context).filter((sku) => !grounded.has(sku));
  const wrongPrices = priceErrors(turn.answer, testCase.question, retrieved, context);
  let hit: boolean | null = null;

  if (turn.error) {
    failures.push(`turn ended with ${turn.error}`);
  }

  if (!turn.toolCalls.some((call) => CATALOG_TOOLS.has(call.name))) {
    failures.push("answered without reading the catalog");
  }

  for (const tool of testCase.tools ?? []) {
    if (!turn.toolCalls.some((call) => call.name === tool)) {
      failures.push(`did not call ${tool}`);
    }
  }

  if (testCase.kind === "none") {
    if (!ABSENCE[testCase.locale].test(turn.answer)) {
      failures.push("did not say that nothing matches");
    }
  } else {
    hit = relevantCards.length > 0;

    if (!hit) {
      failures.push("no relevant product card");
    }
  }

  if (testCase.kind === "match" && relevantCards.length < cards.length) {
    const off = cards.filter((card) => !testCase.relevant(card)).map((card) => card.sku);
    failures.push(`cards outside the request: ${off.join(", ")}`);
  }

  if (testCase.cheapest && relevantTruth.length > 0) {
    const lowest = Math.min(...relevantTruth.map((product) => product.priceVnd));

    if (!relevantCards.some((card) => card.priceVnd === lowest)) {
      failures.push(`no card at the lowest price ${lowest}`);
    }
  }

  if (testCase.size && relevantTruth.length === 1) {
    const available = relevantTruth[0]!.availableSizes.includes(testCase.size);
    const pattern = (available ? IN_STOCK : OUT_OF_STOCK)[testCase.locale];

    if (!pattern.test(turn.answer)) {
      failures.push(
        `did not say that size ${testCase.size} is ${available ? "in" : "out of"} stock`,
      );
    }
  }

  if (ungroundedSkus.length > 0) {
    failures.push(`cited SKUs no tool returned: ${ungroundedSkus.join(", ")}`);
  }

  if (wrongPrices.length > 0) {
    failures.push(`prices that differ from the catalog: ${wrongPrices.length}`);
  }

  return {
    id: testCase.id,
    kind: testCase.kind,
    passed: failures.length === 0,
    failures,
    cards: cards.length,
    relevantCards: relevantCards.length,
    hit,
    ungroundedSkus,
    priceErrors: wrongPrices,
  };
}

export type EvalSummary = {
  cases: number;
  passed: number;
  /** Relevant cards over all cards, for `match` and `lookup` cases. */
  cardPrecision: number | null;
  /** Share of `match` and `lookup` cases with a relevant card. */
  hitRate: number | null;
  /** Share of `none` cases that said nothing matches. */
  abstentionRate: number | null;
  ungroundedSkus: number;
  priceErrors: number;
};

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function summarize(scores: readonly CaseScore[]): EvalSummary {
  const retrieval = scores.filter((score) => score.kind !== "none");
  const none = scores.filter((score) => score.kind === "none");

  return {
    cases: scores.length,
    passed: scores.filter((score) => score.passed).length,
    cardPrecision: ratio(
      retrieval.reduce((sum, score) => sum + score.relevantCards, 0),
      retrieval.reduce((sum, score) => sum + score.cards, 0),
    ),
    hitRate: ratio(retrieval.filter((score) => score.hit).length, retrieval.length),
    abstentionRate: ratio(
      none.filter((score) => !score.failures.includes("did not say that nothing matches")).length,
      none.length,
    ),
    ungroundedSkus: scores.reduce((sum, score) => sum + score.ungroundedSkus.length, 0),
    priceErrors: scores.reduce((sum, score) => sum + score.priceErrors.length, 0),
  };
}
