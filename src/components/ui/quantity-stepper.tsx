"use client";

import { Minus, Plus } from "@phosphor-icons/react";
import { useId, useState } from "react";

import { cx } from "./cx";

export type QuantityStepperProps = {
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  name?: string;
  disabled?: boolean;
  onChange?: (value: number) => void;
  className?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Number input with decrease and increase buttons. The input accepts typing
 * and arrow keys; the value is clamped to `min` and `max` on change.
 */
export function QuantityStepper({
  label,
  decreaseLabel,
  increaseLabel,
  value,
  defaultValue = 1,
  min = 1,
  max = 99,
  name,
  disabled,
  onChange,
  className,
}: QuantityStepperProps) {
  const id = useId();
  const [internal, setInternal] = useState(() => clamp(defaultValue, min, max));
  const current = value ?? internal;

  function update(next: number) {
    const clamped = clamp(Number.isFinite(next) ? Math.trunc(next) : min, min, max);
    if (value === undefined) {
      setInternal(clamped);
    }
    onChange?.(clamped);
  }

  const stepClasses =
    "inline-flex size-11 items-center justify-center text-navy-900 transition-colors duration-150 hover:bg-neutral-100 disabled:pointer-events-none disabled:text-neutral-500";

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-small font-medium text-navy-900">
        {label}
      </label>
      <div className="inline-flex w-fit items-center overflow-hidden rounded-md border border-neutral-500">
        <button
          type="button"
          aria-label={decreaseLabel}
          aria-controls={id}
          disabled={disabled || current <= min}
          onClick={() => update(current - 1)}
          className={stepClasses}
        >
          <Minus aria-hidden size={16} weight="bold" />
        </button>
        <input
          id={id}
          name={name}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={current}
          disabled={disabled}
          onChange={(event) => update(event.currentTarget.valueAsNumber)}
          className="h-11 w-14 [appearance:textfield] border-x border-neutral-300 bg-white text-center text-body font-semibold text-navy-900 tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          aria-label={increaseLabel}
          aria-controls={id}
          disabled={disabled || current >= max}
          onClick={() => update(current + 1)}
          className={stepClasses}
        >
          <Plus aria-hidden size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
