import { useId, type InputHTMLAttributes, type ReactNode } from "react";

import { cx } from "./cx";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

const boxClasses =
  "mt-0.5 size-5 shrink-0 cursor-pointer accent-navy-900 disabled:cursor-not-allowed";

export function Checkbox({ id, label, hint, error, className, ...props }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy =
    [hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <div className="flex items-start gap-3">
        <input
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={boxClasses}
          {...props}
        />
        <label htmlFor={inputId} className="cursor-pointer text-body text-navy-900">
          {label}
        </label>
      </div>
      {hint ? (
        <p id={`${inputId}-hint`} className="pl-8 text-small text-neutral-600">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="pl-8 text-small text-error-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type RadioOption = { value: string; label: ReactNode; hint?: ReactNode; disabled?: boolean };

export type RadioGroupProps = {
  name: string;
  legend: ReactNode;
  options: RadioOption[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: ReactNode;
  className?: string;
};

/**
 * Radio buttons grouped in a fieldset. Arrow keys move between options because
 * they share a name.
 */
export function RadioGroup({
  name,
  legend,
  options,
  defaultValue,
  value,
  onChange,
  error,
  className,
}: RadioGroupProps) {
  const groupId = useId();

  return (
    <fieldset
      className={cx("flex flex-col gap-3", className)}
      aria-describedby={error ? `${groupId}-error` : undefined}
    >
      <legend className="mb-1 text-small font-medium text-navy-900">{legend}</legend>
      {options.map((option, index) => {
        const optionId = `${groupId}-${index}`;
        return (
          <div key={option.value} className="flex items-start gap-3">
            <input
              id={optionId}
              type="radio"
              name={name}
              value={option.value}
              disabled={option.disabled}
              defaultChecked={value === undefined ? defaultValue === option.value : undefined}
              checked={value === undefined ? undefined : value === option.value}
              onChange={onChange ? () => onChange(option.value) : undefined}
              aria-describedby={option.hint ? `${optionId}-hint` : undefined}
              className={boxClasses}
            />
            <div className="flex flex-col">
              <label htmlFor={optionId} className="cursor-pointer text-body text-navy-900">
                {option.label}
              </label>
              {option.hint ? (
                <span id={`${optionId}-hint`} className="text-small text-neutral-600">
                  {option.hint}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
      {error ? (
        <p id={`${groupId}-error`} className="text-small text-error-700">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
