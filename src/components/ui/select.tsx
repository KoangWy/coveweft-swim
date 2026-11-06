import { CaretDown } from "@phosphor-icons/react/ssr";
import { useId, type ReactNode, type SelectHTMLAttributes } from "react";

import { cx } from "./cx";
import { controlBorder, controlClasses, Field, fieldDescriptionIds } from "./field";

export type SelectOption = { value: string; label: string; disabled?: boolean };

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  label: ReactNode;
  options: SelectOption[];
  hint?: ReactNode;
  error?: ReactNode;
  requiredLabel?: string;
  containerClassName?: string;
};

/** Native select, so keyboard and screen reader behavior come from the browser. */
export function Select({
  id,
  label,
  options,
  hint,
  error,
  required,
  requiredLabel,
  className,
  containerClassName,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <Field
      id={selectId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      requiredLabel={requiredLabel}
      className={containerClassName}
    >
      <div className="relative">
        <select
          id={selectId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescriptionIds(selectId, hint, error)}
          className={cx(
            controlClasses,
            controlBorder(Boolean(error)),
            "h-11 appearance-none pr-10",
            className,
          )}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <CaretDown
          aria-hidden
          size={18}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-navy-900"
        />
      </div>
    </Field>
  );
}
