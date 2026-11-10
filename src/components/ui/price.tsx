import type { Locale } from "@/lib/locale";
import { formatVnd } from "@/lib/money";

import { cx } from "./cx";

export type PriceProps = {
  amount: number;
  locale: Locale;
  /** Original price shown struck through when it is higher than `amount`. */
  compareAt?: number;
  /** Accessible prefix for the original price, for example "Original price". */
  compareAtLabel?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizes = {
  sm: "text-small",
  md: "text-body",
  lg: "text-heading",
};

/** Integer VND price, with the original price struck through when it is higher. */
export function Price({
  amount,
  locale,
  compareAt,
  compareAtLabel,
  size = "md",
  className,
}: PriceProps) {
  const showCompare = compareAt !== undefined && compareAt > amount;

  return (
    <span className={cx("inline-flex items-baseline gap-2", className)}>
      <span className={cx("font-semibold text-navy-900", sizes[size])}>
        {formatVnd(amount, locale)}
      </span>
      {showCompare ? (
        <s className="text-small text-neutral-600">
          {compareAtLabel ? <span className="sr-only">{compareAtLabel} </span> : null}
          {formatVnd(compareAt, locale)}
        </s>
      ) : null}
    </span>
  );
}
