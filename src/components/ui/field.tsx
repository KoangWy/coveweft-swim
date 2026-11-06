import { WarningCircle } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";

import { cx } from "./cx";

export type FieldProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Text appended to the label of required fields, for example "(required)". */
  requiredLabel?: string;
  className?: string;
  children: ReactNode;
};

/** Ids for the hint and error text, for `aria-describedby` on the control. */
export function fieldDescriptionIds(id: string, hint?: ReactNode, error?: ReactNode) {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

/**
 * Label above the control, optional hint, and error text below it.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  requiredLabel,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-small font-medium text-navy-900">
        {label}
        {required && requiredLabel ? (
          <span className="ml-1 font-normal text-neutral-600">{requiredLabel}</span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-small text-neutral-600">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-small text-error-700">
          <WarningCircle aria-hidden size={18} className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export const controlClasses =
  "w-full rounded-md border bg-white px-3 text-body text-navy-900 transition-colors duration-150 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-600";

export function controlBorder(invalid: boolean): string {
  return invalid
    ? "border-error-700 hover:border-error-700"
    : "border-neutral-500 hover:border-navy-900";
}
